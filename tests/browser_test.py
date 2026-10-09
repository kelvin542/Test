"""Functional browser checks. Start the app on port 8000 before running."""
import os
import tempfile
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright


def run():
    with tempfile.TemporaryDirectory(prefix="tom-exato-test-") as directory:
        root = Path(directory)
        source = Image.new("RGB", (400, 300))
        source.putdata([(80 + x % 120, 60 + y % 120, 40 + (x + y) % 110)
                        for y in range(300) for x in range(400)])
        source.save(root / "source.png")
        reference = Image.new("RGB", (120, 100), (201, 148, 120))
        reference.save(root / "reference.png")
        errors = []
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=os.environ.get("CHROMIUM_PATH", "/usr/bin/chromium"), args=["--no-sandbox"])
            page = browser.new_page(viewport={"width": 1440, "height": 1000}, device_scale_factor=1)
            page.on("pageerror", lambda error: errors.append(str(error)))
            standalone = os.environ.get("TOM_EXATO_HTML")
            network_requests = []
            page.on("request", lambda request: network_requests.append(request.url)
                    if request.url.startswith(("http:", "https:")) else None)
            if standalone:
                # In-memory loading validates the complete self-contained file
                # even where enterprise browser policy disallows file://.
                page.set_content(Path(standalone).read_text(), wait_until="load")
            else:
                # Simulate previews that cannot resolve adjacent CSS or JS files.
                page.route("**/style.css", lambda route: route.abort())
                page.route("**/app.js", lambda route: route.abort())
                page.route("**/color.js", lambda route: route.abort())
                url = os.environ.get("TOM_EXATO_URL", "http://127.0.0.1:8000")
                response = page.goto(url)
                if not url.startswith("file:"):
                    assert response.status == 200
            assert page.title() == "Tom Exato · Estúdio de cor"
            assert page.locator("#apply").is_disabled()
            assert page.locator(".studio").evaluate("element => getComputedStyle(element).display") == "grid", "CSS layout missing"
            assert page.locator("#export").evaluate("element => getComputedStyle(element).borderRadius") == "9px", "CSS buttons missing"
            assert page.locator(".main-upload").evaluate("element => getComputedStyle(element).display") == "flex", "CSS upload missing"
            assert page.locator('[data-tool="sample"]').is_hidden()
            assert page.locator(".brush-control").is_hidden()
            page.locator("#open-help").click()
            assert page.locator("#help-dialog").is_visible()
            page.locator("#help-done").click()
            assert page.locator("#help-dialog").is_hidden()
            page.screenshot(path="/tmp/tom-exato-desktop.png", full_page=True)

            page.locator("#image-input").set_input_files(root / "source.png")
            page.locator("#canvas-frame").wait_for(state="visible")
            page.locator("#reference-input").set_input_files(root / "reference.png")
            page.locator("#reference-frame").wait_for(state="visible")
            page.locator("#reference-canvas").click(position={"x": 20, "y": 20})
            assert page.locator("#hex").input_value() == "C99478"

            canvas = page.locator("#overlay-canvas")
            bounds = canvas.bounding_box()
            assert bounds["width"] == 400
            points = [(80, 60), (240, 60), (240, 220), (80, 220)]
            for x, y in points:
                canvas.click(position={"x": x, "y": y})
            page.locator("#close-polygon").click()
            assert page.locator("#selected-count").inner_text() == "25.600"
            page.locator("#apply").click()
            assert "25.600 de 25.600" in page.locator("#verification").inner_text()
            assert not page.locator("#show-mask").is_checked()
            page.locator("#before").click()
            assert page.locator("#before-label").is_visible()
            page.locator("#before").click()
            with page.expect_download() as event:
                page.locator("#export").click()
            event.value.save_as(root / "exact.png")
            output = Image.open(root / "exact.png").convert("RGBA")
            assert output.size == (400, 300)
            matched = 0
            for y in range(300):
                for x in range(400):
                    selected = 80 <= x < 240 and 60 <= y < 220
                    expected = (201, 148, 120, 255) if selected else (*source.getpixel((x, y)), 255)
                    assert output.getpixel((x, y)) == expected, (x, y, output.getpixel((x, y)), expected)
                    matched += int(selected)
            assert matched == 25600
            print("PASS: exported PNG has 25,600 exact target pixels; all 94,400 outside pixels are unchanged.")
            page.screenshot(path="/tmp/tom-exato-result.png", full_page=True)

            page.locator("#hex").fill("12345G")
            assert page.locator("#apply").is_disabled()
            assert page.locator("#export").is_disabled()
            assert page.locator("#hex-error").is_visible()
            page.locator("#hex").fill("AABBCC")
            page.locator("#apply").click()
            assert "#AABBCC" in page.locator("#verification").inner_text()
            print("PASS: invalid HEX cannot be applied/exported; changed colors require reapplying.")

            page.locator("#undo").click()
            assert page.locator("#selected-count").inner_text() == "0"
            assert page.locator("#apply").is_disabled()
            page.locator('[data-tool="brush"]').click()
            page.locator("#brush-size").fill("20")
            page.locator("#brush-size").dispatch_event("input")
            bounds = canvas.bounding_box()
            page.mouse.move(bounds["x"] + 80, bounds["y"] + 80)
            page.mouse.down()
            page.mouse.move(bounds["x"] + 140, bounds["y"] + 80, steps=6)
            page.mouse.up()
            before_erase = int(page.locator("#selected-count").inner_text().replace(".", ""))
            assert before_erase > 1000
            page.locator('[data-tool="eraser"]').click()
            canvas.click(position={"x": 110, "y": 80})
            after_erase = int(page.locator("#selected-count").inner_text().replace(".", ""))
            assert 0 < after_erase < before_erase
            page.locator("#undo").click()
            assert int(page.locator("#selected-count").inner_text().replace(".", "")) == before_erase
            page.locator("#clear-selection").click()
            assert page.locator("#selected-count").inner_text() == "0"
            print("PASS: continuous brush, eraser, undo and clear selection.")

            page.locator('[data-tool="polygon"]').click()
            for x, y in points:
                canvas.click(position={"x": x, "y": y})
            canvas.press("Enter")
            page.locator('[name="mode"][value="texture"]').check()
            page.locator('[data-tool="sample"]').click()
            canvas.click(position={"x": 100.5, "y": 100.5})
            original_tone = source.getpixel((100, 100))
            expected_hex = "#" + "".join(f"{value:02X}" for value in original_tone)
            assert page.locator("#source-hex").inner_text() == expected_hex, (page.locator("#source-hex").inner_text(), expected_hex)
            page.locator("#apply").click()
            with page.expect_download() as event:
                page.locator("#export").click()
            event.value.save_as(root / "texture.png")
            texture = Image.open(root / "texture.png").convert("RGB")
            assert texture.getpixel((100, 100)) == (170, 187, 204)
            assert texture.getpixel((90, 90)) != texture.getpixel((100, 100))
            assert texture.getpixel((10, 10)) == source.getpixel((10, 10))
            page.locator("#reset").click()
            assert page.locator("#export").is_disabled()
            assert page.locator("#verification").is_hidden()
            print("PASS: source sampling, texture anchor mapping, preserved differences and reset.")

            page.locator("#zoom-in").click()
            assert page.locator("#zoom-value").inner_text() == "200%"
            assert canvas.bounding_box()["width"] == 800
            assert page.locator("#image-canvas").evaluate("canvas => canvas.width") == 400
            page.locator("#zoom-fit").click()
            assert canvas.bounding_box()["width"] == 400
            print("PASS: zoom enlarges the preview without changing image resolution.")

            page.set_viewport_size({"width": 390, "height": 844})
            page.screenshot(path="/tmp/tom-exato-mobile.png", full_page=True)
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth"), "Mobile horizontal overflow"

            tall = Image.new("RGB", (80, 400), (220, 110, 90))
            for y in range(200, 400):
                for x in range(80):
                    tall.putpixel((x, y), (12, 34, 56))
            tall.save(root / "tall.png")
            page.locator("#reference-input").set_input_files(root / "tall.png")
            page.wait_for_function("document.querySelector('#reference-canvas').height === 400")
            ref = page.locator("#reference-canvas")
            size = ref.bounding_box()
            assert abs(size["width"] / size["height"] - .2) < .001
            ref.click(position={"x": size["width"] / 2, "y": size["height"] * .8})
            assert page.locator("#hex").input_value() == "0C2238"
            print("PASS: portrait reference keeps its aspect ratio and samples the correct visible pixel on mobile.")

            semi = Image.new("RGBA", (20, 20), (150, 100, 80, 128))
            for y in range(20):
                for x in range(10, 20):
                    semi.putpixel((x, y), (0, 0, 0, 0))
            semi.save(root / "alpha.png")
            page.locator("#image-input").set_input_files(root / "alpha.png")
            page.wait_for_function("document.querySelector('#image-canvas').width === 20")
            page.locator('[data-tool="polygon"]').click()
            for x, y in [(0.1, 0.1), (19.9, 0.1), (19.9, 19.9), (0.1, 19.9)]:
                canvas.click(position={"x": x, "y": y})
            canvas.press("Enter")
            page.locator('[name="mode"][value="exact"]').check()
            page.locator("#hex").fill("010203")
            page.locator("#apply").click()
            with page.expect_download() as event:
                page.locator("#export").click()
            event.value.save_as(root / "alpha-exact.png")
            alpha = Image.open(root / "alpha-exact.png").convert("RGBA")
            for y in range(20):
                for x in range(20):
                    assert alpha.getpixel((x, y)) == ((1, 2, 3, 255) if x < 10 else (0, 0, 0, 0))
            print("PASS: partially transparent selected pixels become exact and opaque; fully transparent pixels stay transparent.")
            assert not errors, errors
            if standalone:
                assert not network_requests, network_requests
                print("PASS: standalone HTML completes all operations without any HTTP requests.")
            else:
                assert not any(request.endswith(("/style.css", "/app.js", "/color.js")) for request in network_requests), network_requests
                print("PASS: the main page renders with CSS and runs without adjacent asset files.")
            print("PASS: responsive mobile layout and no JavaScript exceptions.")
            browser.close()


if __name__ == "__main__":
    run()
