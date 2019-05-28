const { google } = require('googleapis');
const tranco = require('./tranco');
const spreadsheet = require('./spreadsheet');
const bugs = require('./bugs');

const main = async () => {
    const config = require('./config.json');
    const LIST_SIZE = config.listSize || 500;
    const LIST_DIR = config.listDir || 'data/';
    const bugzillaKey = config.bugzillaKey || '';
    const githubKey = config.githubKey || '';
    const writers = config.writers || ['user@example.com'];
    let maxDate = config.maxDate || null;

    const week = process.argv[2] || maxDate;
    if (week) {
        // We want to consider open bugs only until the end of the given week.
        const parsed = new Date(week);
        if (isNaN(parsed)) {
            throw new Error("Wrong date format: use yyyy-mm-dd");
        }
        const weekday = parsed.getDay();
        parsed.setDate(parsed.getDate() - weekday + 7);
        maxDate = new Date(parsed - 1);
    }

    const LIST_FILE = await tranco.fetchList(LIST_SIZE, LIST_DIR, maxDate);
    const bugTable = await bugs.fetchBugs(LIST_FILE, bugzillaKey, githubKey, undefined, maxDate);

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
