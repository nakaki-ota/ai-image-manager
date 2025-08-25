import sys
import json
import png
from PIL import Image
from exiftool import ExifToolHelper

def get_metadata(file_path):
    metadata_info = {
        "Pillow": None,
        "PyPNG": None,
        "PyExifTool": None,
        "selected_metadata": None,
        "errors": []
    }

    print(f"--- Processing {file_path} ---")

    # 1. Try with Pillow
    print("Trying with Pillow...")
    try:
        with Image.open(file_path) as img:
            exif = img.getexif()
            if exif:
                print("Pillow: Found EXIF data.")
                metadata_json = exif.get(0x9286)
                if metadata_json:
                    print("Pillow: Found metadata at tag 0x9286.")
                    try:
                        metadata = json.loads(metadata_json)
                        metadata_info["Pillow"] = metadata
                        print("Pillow: Succeeded. JSON parsed successfully.")
                    except json.JSONDecodeError:
                        metadata_info["errors"].append("Pillow: Failed to parse JSON at tag 0x9286.")
                        print("Pillow: Failed to parse JSON at tag 0x9286.")
                else:
                    print("Pillow: Found EXIF data, but no metadata at tag 0x9286.")
            else:
                print("Pillow: No EXIF data found.")
    except Exception as e:
        metadata_info["errors"].append(f"Pillow: {e}")
        print(f"Pillow: Failed with error: {e}")

    # 2. Try with PyPNG
    print("Trying with PyPNG...")
    try:
        reader = png.Reader(filename=file_path)
        t_text_found = False
        for chunk_type, chunk_data in reader.chunks():
            if chunk_type == b'tEXt':
                t_text_found = True
                print("PyPNG: Found tEXt chunk.")
                key_value_pair = chunk_data.decode('latin-1').split('\x00')
                if len(key_value_pair) == 2 and key_value_pair[0] == 'parameters':
                    print("PyPNG: Found 'parameters' key.")
                    try:
                        metadata = json.loads(key_value_pair[1])
                        metadata_info["PyPNG"] = metadata
                        print("PyPNG: Succeeded. JSON parsed successfully.")
                        break
                    except json.JSONDecodeError:
                        metadata_info["errors"].append("PyPNG: Failed to parse JSON from 'parameters' value.")
                        print("PyPNG: Failed to parse JSON from 'parameters' value.")
                else:
                    print(f"PyPNG: Found tEXt chunk but key is not 'parameters'.")
        if not t_text_found:
            print("PyPNG: No tEXt chunk found.")
    except Exception as e:
        metadata_info["errors"].append(f"PyPNG: {e}")
        print(f"PyPNG: Failed with error: {e}")

    # 3. Try with PyExifTool
    print("Trying with PyExifTool...")
    try:
        with ExifToolHelper() as et:
            metadata_list = et.get_metadata(file_path)
            if metadata_list:
                textual_data = metadata_list[0].get('PNG:TextualData', [])
                if textual_data:
                    print("PyExifTool: Found PNG:TextualData.")
                    parameters_item = next((item for item in textual_data if 'parameters' in item), None)
                    if parameters_item:
                        print("PyExifTool: Found 'parameters' key.")
                        try:
                            metadata = json.loads(parameters_item['parameters'])
                            metadata_info["PyExifTool"] = metadata
                            print("PyExifTool: Succeeded. JSON parsed successfully.")
                        except json.JSONDecodeError:
                            metadata_info["errors"].append("PyExifTool: Failed to parse JSON from 'parameters' value.")
                            print("PyExifTool: Failed to parse JSON from 'parameters' value.")
                    else:
                        print("PyExifTool: No 'parameters' key found.")
                else:
                    print("PyExifTool: No PNG:TextualData found.")
    except Exception as e:
        metadata_info["errors"].append(f"PyExifTool: {e}")
        print(f"PyExifTool: Failed with error: {e}")

    # Select the first successful result
    if metadata_info["Pillow"]:
        metadata_info["selected_metadata"] = metadata_info["Pillow"]
    elif metadata_info["PyPNG"]:
        metadata_info["selected_metadata"] = metadata_info["PyPNG"]
    elif metadata_info["PyExifTool"]:
        metadata_info["selected_metadata"] = metadata_info["PyExifTool"]
        
    print("\n--- Summary ---")
    print(f"Pillow result: {'Success' if metadata_info['Pillow'] else 'Failed'}")
    print(f"PyPNG result: {'Success' if metadata_info['PyPNG'] else 'Failed'}")
    print(f"PyExifTool result: {'Success' if metadata_info['PyExifTool'] else 'Failed'}")

    if metadata_info["selected_metadata"]:
        print("\nSelected metadata:")
        print(json.dumps(metadata_info["selected_metadata"], indent=2))
    else:
        print("\nNo metadata could be extracted by any library.")
        print("Errors and specific failures encountered:")
        for error in metadata_info["errors"]:
            print(f"- {error}")
    
    print("-" * 20)
    return metadata_info

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_metadata.py <image_file_path>")
        sys.exit(1)
    
    image_file_path = sys.argv[1]
    get_metadata(image_file_path)