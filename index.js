const { google } = require('googleapis');
const bugs = require('./bugs');
const helpers = require('./helpers');
const spreadsheet = require('./spreadsheet');
const tranco = require('./tranco');

const argv = process.argv.slice(2);

const main = async () => {
    const config = require('./config.json');
    const LIST_SIZE = config.listSize || 500;
    const LIST_DIR = config.listDir || 'data/';
    const bugzillaKey = config.bugzillaKey || '';
    const githubKey = config.githubKey || '';
    const writers = config.writers || ['user@example.com'];
    const maxDate = config.maxDate || undefined;
    const minDate = config.minDate || "2018";
    let id = config.spreadsheetId;
    let queryDates = [];

    const parsedMinDate = new Date(minDate);
    if (isNaN(parsedMinDate)) {
        throw new Error("Wrong minDate format: use yyyy-mm-dd");
    }

    const inputDate = argv[0] || maxDate;
    if (argv.includes("--resume")) {
        queryDates = helpers.resumeQueryDates(inputDate);
    } else if (argv.includes("--backfill")) {
        queryDates = helpers.backfillQueryDates(inputDate);
    } else {
        queryDates = helpers.getQueryDates(inputDate);
    }

    for (const date of queryDates) {
        const LIST_FILE = await tranco.fetchList(LIST_SIZE, LIST_DIR, date);
        const bugTable = await bugs.fetchBugs(LIST_FILE, bugzillaKey, githubKey, parsedMinDate, date, !config.ignoreFenix);
        if (bugTable.get("bugzilla").length + bugTable.get("webcompat").length === 0) {
                console.warn("List was empty or malformed!");
                continue;
        }

        const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
        const auth = await google.auth.getClient({ scopes: SCOPES });
        const sheets = google.sheets({ version: 'v4', auth });
        const drive = google.drive({ version: 'v3', auth })

        const docTitle = 'Top Site Compatibility Index';
        if (!id) {
            id = await spreadsheet.createSpreadsheet(sheets, docTitle, date);
        }
        const { sheetId, title } = await spreadsheet.findOrCreateSheet(sheets, id, date);
        await spreadsheet.addStaticData(sheets, id, LIST_SIZE, LIST_FILE, sheetId, title);
        await spreadsheet.addBugData(sheets, id, bugTable, title);
        await spreadsheet.updateSummary(sheets, id, date);
        for (const writer of writers) {
            await spreadsheet.shareSheet(drive, id, writer);
            console.log(`► https://docs.google.com/spreadsheets/d/${id}/edit`)
        }
    }
}

main();
