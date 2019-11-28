const fs = require("fs");
const tranco = require("../tranco.js");
const config = {
  ignoredDomains: ["boring.com", "superboring.com"],
};

beforeEach(async () => {
  // Create a copy of the test.csv,
  // so we can modify it
  await fs.promises.copyFile(
    "tests/fixtures/test.csv",
    "tests/fixtures/copy.csv"
  );
});

afterAll(async () => {
  // Get rid of the copy when we're done
  await fs.promises.unlink("tests/fixtures/copy.csv");
});

test("ignoredDomains get removed", async () => {
  await tranco
    .removeIgnoredDomains("./tests/fixtures/copy.csv", config)
    .then(async csvPath => {
      const data = await fs.promises.readFile(csvPath, "utf8");
      const lines = data.split(/\r?\n/);

      expect(lines.length).toBe(8);
      expect(csvPath).toBe("./tests/fixtures/copy.csv");
    });
});
