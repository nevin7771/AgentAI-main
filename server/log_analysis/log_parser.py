#!/usr/bin/env python3
import os
import json
import logging
from pathlib import Path
import sys
import pandas as pd


class WindowsAnalyzer:
    def __init__(self):
        self.setup_logging()
        self.initialize_data_structures()

    def setup_logging(self):
        logging.basicConfig(
            level=logging.INFO,
            format=\'%(asctime)s - %(levelname)s - %(message)s\'
        )
        self.logger = logging.getLogger(__name__)

    def initialize_data_structures(self):
        """Initialize all data collection dictionaries"""
        self.client_info = {}
        self.client_http_re = {
            \'OUT_Request\': {\'ID\': [], \'Req\': [], \'Date\': []},
            \'IN_Request\': {\'ID\': [], \'Res\': []},
            \'Web_Request\': {\'ID\': [], "Req_ID": []}
        }
        self.client_web_re = {
            \'OUT_Request\': {\'Req\': [], \'URL\': [], \'Date\': []},
            \'IN_Request\': {\'URL\': [], \'Res\': []},
            \'Web_Request\': {\'ID\': [], "Req_ID": []}
        }
        self.client_dns_re = {
            \'OUT_Request\': {\'Req\': [], \'HOST\': [], \'Date\': []},
            \'IN_Request\': {\'Req\': [], \'Res\': []}
        }
        self.client_meeting = {
            \'Meeting_Details\': {
                \'Leave Time\': [], \'Meeting ID\': [], \'Leave Reason\': []
            }
        }

    def analyze_win_pt(self, log_path: str) -> dict:
        """
        Analyze Windows PT logs
        Returns: JSON analysis result
        """
        try:
            log_path = Path(log_path)
            self.logger.info(
                "Starting Windows PT log analysis for: {}".format(log_path))

            # Print first few lines of the file for debugging
            try:
                with open(log_path, \'r\', errors=\'ignore\') as f:
                    first_lines = [next(f) for _ in range(5)]
                    self.logger.info("First 5 lines of file:")
                    for line in first_lines:
                        self.logger.info(line.strip())
            except Exception as e:
                self.logger.error(
                    "Error reading file preview: {}".format(str(e)))

            # Handle both single file and directory
            if log_path.is_file():
                self.process_log_file(log_path)
            elif log_path.is_dir():
                for file_path in log_path.glob(\'*\'):
                    if file_path.is_file():
                        self.process_log_file(file_path)
            else:
                raise Exception("Path not found: {}".format(log_path))

            # Log data structure contents before conversion
            self.logger.info(
                "Client Info collected: {}".format(self.client_info))
            self.logger.info("HTTP Requests collected: {}".format(
                len(self.client_http_re[\'OUT_Request\'][\'ID\'])))
            self.logger.info("DNS Requests collected: {}".format(
                len(self.client_dns_re[\'OUT_Request\'][\'Req\'])))

            # Convert analysis results to DataFrames and then to JSON
            analysis_results = self.convert_results_to_json()
            return analysis_results

        except Exception as e:
            self.logger.error("Error in analyze_win_pt: {}".format(str(e)))
            raise

    def process_log_file(self, file_path: Path):
        """Process a single log file"""
        try:
            self.logger.info("Processing file: {}".format(file_path.name))
            lines_processed = 0
            matches_found = 0

            with open(file_path, \'r\', errors=\'ignore\') as f:
                for line in f:
                    lines_processed += 1
                    line = line.strip()
                    if self.process_line(line):
                        matches_found += 1

                    # Log progress every 1000 lines
                    if lines_processed % 1000 == 0:
                        self.logger.info("Processed {} lines, found {} matches".format(
                            lines_processed, matches_found))

            self.logger.info("Finished processing {} lines, found {} matches".format(
                lines_processed, matches_found))

        except Exception as e:
            self.logger.error(
                "Error processing file {}: {}".format(file_path, str(e)))
            raise

    def process_line(self, line: str):
        """
        Process each line of the log file
        Returns: True if any match was found in this line
        """
        try:
            found_match = False

            # Client Info Processing
            if \'m_accountID:\' in line:
                self.logger.info(
                    "Found account ID line: {}".format(line[:100]))
                if \' Option5:\' in line and \'Option:0\' not in line:
                    word = line.split(\'m_accountID:\')[1]
                    word1 = line.split(\'UesrID:\')[1].split(\' \')[0]
                    self.client_info[\'UserID\'] = word1
                    self.client_info[\'AccountID\'] = word.split(\' \')[0]
                    found_match = True
                    self.logger.info("Extracted UserID: {} AccountID: {}".format(
                        word1, word.split(\' \')[0]))

            elif \'[CSBUserProfile::ReadFromProto] inactive\' in line:
                self.logger.info("Found SSO line: {}".format(line[:100]))
                word = line.split(\'[CSBUserProfile::ReadFromProto] inactive:\')[
                    1].split(\' \')[1].split(\":\")[1]
                self.client_info[\'SSO\'] = \'SSO Disabled\' if int(
                    word) == 0 else \'SSO Enabled\'
                found_match = True
                self.logger.info("Extracted SSO status: {}".format(
                    self.client_info[\'SSO\']))

            # OS Info Processing
            elif any(x in line for x in [\'ZOOM.Mac\', \'ZOOM.Win\', \'ZOOM.Linux\']):
                self.logger.info("Found OS info line: {}".format(line[:100]))
                if \'ZOOM.Mac\' in line:
                    word = line.split(\'ZOOM.\')[1]
                    self.client_info[\'OS Platform\'] = word.split(\' \')[0]
                    self.client_info[\'OS Version\'] = word.split(\' \')[1]
                elif \'ZOOM.Win\' in line:
                    word = line.split(\'ZOOM.\')[1]
                    self.client_info[\'OS Platform\'] = word.split(\' \')[0]
                    self.client_info[\'OS Version\'] = word.split(\' \')[1]
                elif \'ZOOM.Linux\' in line:
                    word = line.split(\'ZOOM.\')[1]
                    self.client_info[\'OS Platform\'] = word.split(\' \')[0]
                    self.client_info[\'OS Version\'] = word.split(\'Linux\')[
                        2].replace(\'\', \'\')
                found_match = True
                self.logger.info("Extracted OS Platform: {} Version: {}".format(
                    self.client_info.get(\'OS Platform\', \'N/A\'),
                    self.client_info.get(\'OS Version\', \'N/A\')))

            # HTTP Request Processing
            elif "HEADER_OUT: POST " in line:
                self.logger.info(
                    "Found HTTP request line: {}".format(line[:100]))
                word = line.split(\'This:\')[1].split(\' \')[0]
                word1 = line.split(\'POST\')[1].replace(\'\\n\', \'\')
                word2 = line.split(\'POST\')[0].split(\'\\ZOOM\\t[\')[0]
                self.client_http_re[\'OUT_Request\'][\'ID\'].append(word)
                self.client_http_re[\'OUT_Request\'][\'Req\'].append(word1)
                self.client_http_re[\'OUT_Request\'][\'Date\'].append(word2)
                found_match = True
                self.logger.info(
                    "Extracted HTTP request - ID: {} Req: {}".format(word, word1[:50]))

            # DNS Processing
            elif "dns_provider_t::async_resolve_i, ctx->" in line:
                self.logger.info(
                    "Found DNS request line: {}".format(line[:100]))
                word = line.split(
                    "dns_provider_t::async_resolve_i, ctx->m_host = ")[1].split(\,\')[0]
                word1 = line.split("this = ")[1].replace(\'\\n\', \'\')
                word2 = line.split(\'rv = \')[1].split(\,\')[0]
                word3 = line.split(\'rv = \')[0].split(\'\\ZOOM\\t[\')[0]
                self.client_dns_re[\'OUT_Request\'][\'Req\'].append(word1)
                self.client_dns_re[\'OUT_Request\'][\'Date\'].append(word3)
                self.client_dns_re[\'IN_Request\'][\'Req\'].append(word1)
                self.client_dns_re[\'OUT_Request\'][\'HOST\'].append(word)
                self.client_dns_re[\'IN_Request\'][\'Res\'].append(word2)
                found_match = True
                self.logger.info(
                    "Extracted DNS request - Host: {} Response: {}".format(word, word2))

            # [Rest of your process_line logic with similar logging]

            return found_match

        except Exception as e:
            self.logger.error(
                "Error processing line: {} - Error: {}".format(line[:100], str(e)))
            return False

    def convert_results_to_json(self) -> dict:
        """Convert all analysis results to JSON format"""
        try:
            self.logger.info("Converting results to JSON")

            # Convert client info to DataFrame and then to dict
            client_info_df = pd.DataFrame(
                self.client_info.items(), columns=["Info", "Values"])
            self.logger.info(
                "Client info rows: {}".format(len(client_info_df)))

            # Process HTTP requests
            df1 = pd.DataFrame(self.client_http_re[\'OUT_Request\'])
            df2 = pd.DataFrame(self.client_http_re[\'IN_Request\'])
            df3 = pd.DataFrame(self.client_http_re[\'Web_Request\'])

            self.logger.info("HTTP Request DFs sizes - OUT: {}, IN: {}, Web: {}".format(
                len(df1), len(df2), len(df3)))

            client_http_info = pd.DataFrame()
            if not df1.empty and not df2.empty:
                client_http_info = pd.merge(df1, df2, on="ID")
                if not df3.empty:
                    client_http_info = pd.merge(client_http_info, df3, on="ID")
                client_http_info = client_http_info.drop_duplicates()

            # Process Web requests
            wdf1 = pd.DataFrame(self.client_web_re[\'OUT_Request\'])
            wdf2 = pd.DataFrame(self.client_web_re[\'IN_Request\'])
            client_web_info = pd.DataFrame()

            self.logger.info("Web Request DFs sizes - OUT: {}, IN: {}".format(
                len(wdf1), len(wdf2)))

            if not wdf1.empty and not wdf2.empty:
                client_web_info = pd.merge(
                    wdf1, wdf2, on="URL").drop_duplicates()

            # Process DNS requests
            ddf1 = pd.DataFrame(self.client_dns_re[\'OUT_Request\'])
            ddf2 = pd.DataFrame(self.client_dns_re[\'IN_Request\'])
            client_dns_info = pd.DataFrame()

            self.logger.info("DNS Request DFs sizes - OUT: {}, IN: {}".format(
                len(ddf1), len(ddf2)))

            if not ddf1.empty and not ddf2.empty:
                client_dns_info = pd.merge(
                    ddf1, ddf2, on="Req").drop_duplicates()

            # Process Meeting info
            client_meeting_info = pd.DataFrame(
                self.client_meeting[\'Meeting_Details\']).drop_duplicates()

            self.logger.info("Meeting details size: {}".format(
                len(client_meeting_info)))

            result = {
                \'client_info\': client_info_df.to_dict(orient=\'records\'),
                \'http_requests\': client_http_info.to_dict(orient=\'records\') if not client_http_info.empty else [],
                \'web_requests\': client_web_info.to_dict(orient=\'records\') if not client_web_info.empty else [],
                \'dns_requests\': client_dns_info.to_dict(orient=\'records\') if not client_dns_info.empty else [],
                \'meeting_details\': client_meeting_info.to_dict(orient=\'records\') if not client_meeting_info.empty else []
            }

            self.logger.info("Final result structure: {}".format(
                {k: len(v) for k, v in result.items()}))

            return result

        except Exception as e:
            self.logger.error(
                "Error converting results to JSON: {}".format(str(e)))
            raise


def main():
    if len(sys.argv) != 2:
        print("Usage: python analyze_win.py <log_file_or_directory>")
        sys.exit(1)

    log_path = sys.argv[1]
    analyzer = WindowsAnalyzer()

    try:
        result = analyzer.analyze_win_pt(log_path)
        print(json.dumps(result, indent=2))
    except Exception as e:
        print("Error: {}".format(str(e)))
        sys.exit(1)


if __name__ == "__main__":
    main()

