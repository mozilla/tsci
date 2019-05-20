const { google } = require('googleapis');
const tranco = require('./tranco');
const spreadsheet = require('./spreadsheet');
const bugs = require('./bugs');

const LIST_SIZE = 500;
const LIST_FILE = 'data/list.csv';

const main = async () => {
    await tranco.fetchList(LIST_SIZE, LIST_FILE);
    const bugTable = await bugs.fetchBugs(LIST_FILE);

    const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
    const auth = await google.auth.getClient({ scopes: SCOPES });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth })

    const title = 'Top Site Compatibility Index';
    const id = await spreadsheet.createSpreadsheet(drive, title, LIST_FILE);
    await spreadsheet.addStaticData(sheets, id, LIST_SIZE);
    await spreadsheet.addBugData(sheets, id, bugTable);
    // TODO add a graph
    await spreadsheet.shareSheet(drive, id, 'pastith@gmail.com');
}

main();
