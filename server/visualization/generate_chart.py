#!/usr/bin/env python3
# server/visualization/generate_chart.py

import sys
import json
import pandas as pd
import matplotlib.pyplot as plt
import logging
import os

# Setup logging
logging.basicConfig(level=logging.INFO, format=\"%(asctime)s - %(levelname)s - %(message)s\")
logger = logging.getLogger(__name__)

# Ensure Matplotlib uses a backend that doesn\t require a GUI
plt.switch_backend(\"Agg\")

def create_visualization(data, chart_type=\"bar\", output_path=\"/home/ubuntu/chart.png\"):
    \"\"
    Generates a visualization based on the provided data.

    Args:
        data (list): A list of dictionaries, e.g., [{\"label\": \"High\", \"value\": 10}, {\"label\": \"Medium\", \"value\": 25}].
        chart_type (str): The type of chart to generate (\"bar\" or \"pie\").
        output_path (str): The absolute path to save the generated chart image.

    Returns:
        str: The path where the chart was saved, or None if an error occurred.
    \"\"
    try:
        if not data:
            logger.warning(\"No data provided for visualization.\")
            return None

        logger.info(f\"Generating {chart_type} chart with {len(data)} data points.\")

        # Create DataFrame from data
        df = pd.DataFrame(data)

        if \"label\" not in df.columns or \"value\" not in df.columns:
            logger.error(\"Input data must contain \label\" and \value\" columns.\")
            return None

        # Ensure value column is numeric
        df[\"value\"] = pd.to_numeric(df[\"value\"])

        fig, ax = plt.subplots(figsize=(8, 6))

        if chart_type == \"bar\":
            ax.bar(df[\"label\"], df[\"value\"])
            ax.set_ylabel(\"Count\")
            ax.set_title(\"Data Distribution\")
            plt.xticks(rotation=45, ha=\"right\")
        elif chart_type == \"pie\":
            # Filter out zero or negative values for pie chart
            df_pie = df[df[\"value\"] > 0]
            if df_pie.empty:
                logger.warning(\"No positive data available for pie chart.\")
                return None
            ax.pie(df_pie[\"value\"], labels=df_pie[\"label\"], autopct=\"%1.1f%%\")
            ax.set_title(\"Data Proportions\")
        else:
            logger.error(f\"Unsupported chart type: {chart_type}\")
            return None

        plt.tight_layout()
        
        # Ensure the output directory exists
        output_dir = os.path.dirname(output_path)
        if not os.path.exists(output_dir):
            os.makedirs(output_dir)
            logger.info(f\"Created output directory: {output_dir}\")
            
        plt.savefig(output_path)
        plt.close(fig) # Close the figure to free memory
        logger.info(f\"Chart saved successfully to: {output_path}\")
        return output_path

    except Exception as e:
        logger.error(f\"Error generating visualization: {e}\")
        return None

def main():
    if len(sys.argv) < 3:
        print(json.dumps({\"success\": False, \"error\": \"Usage: python generate_chart.py <json_data_string> <output_path> [chart_type]\"}))
        sys.exit(1)

    try:
        json_data_string = sys.argv[1]
        output_path = sys.argv[2]
        chart_type = sys.argv[3] if len(sys.argv) > 3 else \"bar\"

        # Parse JSON data
        data = json.loads(json_data_string)

        # Generate chart
        saved_path = create_visualization(data, chart_type, output_path)

        if saved_path:
            print(json.dumps({\"success\": True, \"chart_path\": saved_path}))
        else:
            print(json.dumps({\"success\": False, \"error\": \"Failed to generate chart.\"}))

    except json.JSONDecodeError:
        print(json.dumps({\"success\": False, \"error\": \"Invalid JSON data provided.\"}))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({\"success\": False, \"error\": f\"An unexpected error occurred: {e}\"}))
        sys.exit(1)

if __name__ == \"__main__\":
    main()

