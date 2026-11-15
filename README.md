# pxai-model-v1 (data only, no code)

Weights for "Scan on this server" in the reliability site's photo editor (askpi-site `pxai_local_kit`, PXAI_LOCAL_V1).

- Model: OpenAI CLIP ViT-B/32, image tower only (`openai/clip-vit-base-patch32`), MIT licence, Copyright (c) 2021 OpenAI.
- Format: numpy `.npz` (no pickle), linear weights int8 with one float32 scale per output row; split in two parts.
- Join: `cat vit_b32_int8.npz.part0 vit_b32_int8.npz.part1 > vit_b32_int8.npz` and check `vit_b32_int8.npz.sha256`.

This branch holds no app code and is never merged.

MIT License — Copyright (c) 2021 OpenAI. Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.
