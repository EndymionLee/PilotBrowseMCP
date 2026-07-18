from PIL import Image, ImageDraw

input_file = "rawLogo.png"
output_file = "logo.png"

img = Image.open(input_file).convert("RGBA")
w, h = img.size
radius = int(min(w, h) * 0.15)

mask = Image.new("L", (w, h), 0)
draw = ImageDraw.Draw(mask)
draw.rounded_rectangle((0, 0, w - 1, h - 1), radius=radius, fill=255)

img.putalpha(mask)
img.save(output_file, "PNG")
print("Done")
