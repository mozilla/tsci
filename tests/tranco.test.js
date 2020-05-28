const fs = require("fs");
const trexa = require("../trexa.js");

const args = {
  listFile: "./tests/fixtures/copy.csv",
  config: {
    ignoredDomains: ["boring.com", "superboring.com", "last.com"],
    listSize: 5,
  },
};

beforeEach(async () => {
  // Create a copy of the test.csv,
  // so we can modify it
  await fs.promises.copyFile("tests/fixtures/test.csv", args.listFile);
});

afterAll(async () => {
  // Get rid of the copy when we're done
  await fs.promises.unlink(args.listFile);
});

test("ignoredDomains get removed", async () => {
  await trexa.removeIgnoredDomains(args).then(async returnedArgs => {
    const data = await fs.promises.readFile(returnedArgs.listFile, "utf8");
    const lines = data.split(/^/m);

    expect(lines.length).toBe(7);
    expect(returnedArgs.listFile).toBe(args.listFile);
  });
});

describe("clampListSize tests", () => {
  test("clampListSize current size > config.listSize", async () => {
    await trexa.clampListSize(args).then(async csvPath => {
      const data = await fs.promises.readFile(csvPath, "utf8");
      const lines = data.split(/\r?\n/);

      expect(lines.length).toBe(5);
      expect(csvPath).toBe(args.listFile);
    });
  });

  test("clampListSize current size < config.listSize", async () => {
    args.config.listSize = 15;
    await trexa.clampListSize(args).then(async csvPath => {
      const data = await fs.promises.readFile(csvPath, "utf8");
      const lines = data.split(/\r?\n/);

      expect(lines.length).toBe(10);
      expect(csvPath).toBe(args.listFile);
    });
  });
});
