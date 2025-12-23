import sys
from PIL import Image
from collections import Counter
import math

def rgb_to_hex(rgb):
    return '#{:02x}{:02x}{:02x}'.format(rgb[0], rgb[1], rgb[2])

def get_colors(image_path, num_colors=10):
    try:
        image = Image.open(image_path)
        image = image.convert('RGB')
        # Resize to speed up processing
        image = image.resize((150, 150))
        pixels = list(image.getdata())
        
        # Simple quantization to group similar colors
        quantized_pixels = []
        for r, g, b in pixels:
             # Round to nearest 10
            r = round(r / 10) * 10
            g = round(g / 10) * 10
            b = round(b / 10) * 10
            quantized_pixels.append((r, g, b))

        counts = Counter(quantized_pixels)
        common = counts.most_common(num_colors * 5) # Get top 50 to filter
        
        print(f"Top colors found in {image_path}:")
        
        params = []
        
        for color, count in common:
            hex_code = rgb_to_hex(color)
            r, g, b = color
            
            # Filter out pure whites/blacks if we want to find the brand colors mostly
            # But we do want to know the background nuances.
            
            print(f"{hex_code}: {count} occurrences (R:{r} G:{g} B:{b})")
            
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python extract_colors.py <image_path>")
        sys.exit(1)
    
    image_path = sys.argv[1]
    get_colors(image_path)
