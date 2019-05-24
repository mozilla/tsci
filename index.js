const { google } = require('googleapis');
const tranco = require('./tranco');
const spreadsheet = require('./spreadsheet');
const bugs = require('./bugs');

const LIST_SIZE = 500;
const LIST_FILE = 'data/list.csv';
const API_KEY_FILE = 'api-key.ini';
const writers = ['pastith@gmail.com'];

const main = async () => {
    let maxDate;
    const week = process.argv[2];
    if (week) {
      // We want to consider open bugs only until the end of the given week.
      const parsed = new Date(week);
      const weekday = parsed.getDay();
      parsed.setDate(parsed.getDate() - weekday + 7);
      maxDate = new Date(parsed - 1);
    }

    await tranco.fetchList(LIST_SIZE, LIST_FILE);
    const bugTable = await bugs.fetchBugs(LIST_FILE, API_KEY_FILE, undefined, maxDate);

    const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
    const auth = await google.auth.getClient({ scopes: SCOPES });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth })

    const title = 'Top Site Compatibility Index';
    const id = await spreadsheet.createSpreadsheet(drive, title, LIST_FILE);
    await spreadsheet.addStaticData(sheets, id, LIST_SIZE);
    await spreadsheet.addBugData(sheets, id, bugTable);
    // TODO add a graph
    for (const writer of writers) {
        await spreadsheet.shareSheet(drive, id, writer);
    }
}

main();
