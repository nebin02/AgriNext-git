const test = require("node:test");
const assert = require("node:assert/strict");
const { validateImageContent } = require("../upload");

const runValidation = (file) => {
    let nextCalled = false;
    const response = {
        statusCode: 200,
        body: null,
        status(statusCode) {
            this.statusCode = statusCode;
            return this;
        },
        json(body) {
            this.body = body;
            return this;
        }
    };

    validateImageContent({ file }, response, () => {
        nextCalled = true;
    });

    return { nextCalled, ...response };
};

test("accepts supported image MIME types with matching file signatures", () => {
    const files = [
        {
            mimetype: "image/jpeg",
            buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00])
        },
        {
            mimetype: "image/jpg",
            buffer: Buffer.from([0xff, 0xd8, 0xff, 0x00])
        },
        {
            mimetype: "image/png",
            buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
        },
        {
            mimetype: "image/webp",
            buffer: Buffer.from("RIFF0000WEBP", "ascii")
        }
    ];

    for (const file of files) {
        assert.equal(runValidation(file).nextCalled, true);
    }
});

test("rejects a supported MIME type with mismatched image data", () => {
    const result = runValidation({
        mimetype: "image/png",
        buffer: Buffer.from("not an image")
    });

    assert.equal(result.nextCalled, false);
    assert.equal(result.statusCode, 400);
    assert.equal(result.body.message, "Only JPG, PNG and WEBP images are allowed");
});

test("allows a missing file through so the controller can return its existing error", () => {
    assert.equal(runValidation(undefined).nextCalled, true);
});
