Put supplier data sheets here as PDFs, then run:

    python3 docs/build-lube-tds.py

The product is identified from the heading inside the sheet rather than the
filename, so a file renamed in transit still lands on the right product.

A sheet with no text layer is a scan, and no parser can read it. The script
says so by name; type those figures into docs/source/tds-overrides.json:

    { "TEBOIL COMPRESSOR OIL SHV 46": { "pour": -45, "vi": 135 } }

Keys are product names, matched the same way. Anything set there wins over
what was parsed, so it is also the place to correct a misread.

A pour point is not an operating limit. It disqualifies a product; it never
approves one.
