const fs = require("fs");
const tranco = require("../tranco.js");

const config = {
  ignoredDomains: ["boring.com", "superboring.com"],
  listSize: 5,
};
const COPY = "./tests/fixtures/copy.csv";

beforeEach(async () => {
  // Create a copy of the test.csv,
  // so we can modify it
  await fs.promises.copyFile("tests/fixtures/test.csv", COPY);
});

afterAll(async () => {
  // Get rid of the copy when we're done
  await fs.promises.unlink(COPY);
});

test("ignoredDomains get removed", async () => {
  await tranco.removeIgnoredDomains(COPY, config).then(async csvPath => {
    const data = await fs.promises.readFile(csvPath, "utf8");
    const lines = data.split(/\r?\n/);

    expect(lines.length).toBe(8);
    expect(csvPath).toBe(COPY);
  });
});

describe("clampListSize tests", () => {
  test("clampListSize current size > config.listSize", async () => {
    await tranco.clampListSize(COPY, config).then(async csvPath => {
      const data = await fs.promises.readFile(csvPath, "utf8");
      const lines = data.split(/\r?\n/);

      expect(lines.length).toBe(5);
      expect(csvPath).toBe(COPY);
    });
  });

  test("clampListSize current size < config.listSize", async () => {
    config.listSize = 15;
    await tranco.clampListSize(COPY, config).then(async csvPath => {
      const data = await fs.promises.readFile(csvPath, "utf8");
      const lines = data.split(/\r?\n/);

      expect(lines.length).toBe(10);
      expect(csvPath).toBe(COPY);
    });
  });
});
