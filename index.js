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
    let originalId = config.spreadsheetId;
    let cloneId;
    let queryDates = [];

    const parsedMinDate = new Date(minDate);
    if (isNaN(parsedMinDate)) {
        throw new Error("Wrong minDate format: use yyyy-mm-dd");
    }

    const inputDate = argv[0] || maxDate;
    if (argv.includes("--resume")) {
        queryDates = helpers.resumeQueryDates(inputDate);
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
        if (!originalId) {
            originalId = await spreadsheet.createSpreadsheet(sheets, docTitle, date);
        }
        // Create a clone of the document here so we can operate on that
        // and only copy over the completed sheet.
        cloneId = await spreadsheet.cloneDocument(drive, originalId);
        const { sheetId, title } = await spreadsheet.findOrCreateSheet(sheets, cloneId, date);
        await spreadsheet.addStaticData(sheets, cloneId, LIST_SIZE, LIST_FILE, sheetId, title);
        await spreadsheet.addBugData(sheets, cloneId, bugTable, title);
        await spreadsheet.copySheetToOriginal(sheets, cloneId, originalId);
        await spreadsheet.updateSummary(sheets, originalId, date);
        // delete the clone, because we don't need it anymore.
        await drive.files.delete({fileId: cloneId});

        for (const writer of writers) {
            await spreadsheet.shareSheet(drive, originalId, writer);
            console.log(`► https://docs.google.com/spreadsheets/d/${originalId}/edit`)
        }
    }
}

main();
