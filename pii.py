from presidio_analyzer import AnalyzerEngine
from presidio_anonymizer import AnonymizerEngine

import os

FOLDER_PATH = "/Users/naveenkumar/Desktop/jiraConfluence/jira copy"


# Initialize analyzer & increase max_length
analyzer = AnalyzerEngine()
analyzer.nlp_engine.nlp["en"].max_length = 70_000_000

anonymizer = AnonymizerEngine()


def split_text(text, chunk_size=500_000):
    for i in range(0, len(text), chunk_size):
        yield text[i:i + chunk_size]


def clean_text(text):
    final_text = ""
    for chunk in split_text(text):
        results = analyzer.analyze(text=chunk, entities=[
            "EMAIL_ADDRESS", "IP_ADDRESS", "PERSON"], language="en")
        anonymized = anonymizer.anonymize(text=chunk, analyzer_results=results)
        final_text += anonymized.text
    return final_text


def clean_files(folder_path):
    for filename in os.listdir(folder_path):
        if filename.endswith(".txt"):
            file_path = os.path.join(folder_path, filename)
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    content = f.read()
                if not content.strip():
                    print(f"Skipped empty file: {filename}")
                    continue
                cleaned = clean_text(content)
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(cleaned)
                print(f"✅ Cleaned: {filename}")
            except Exception as e:
                print(f"❌ Failed to clean {filename}: {e}")


clean_files(FOLDER_PATH)
