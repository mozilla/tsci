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
    let currentDocId = config.startingSpreadsheetId;
    let oldDocId;
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
        if (!currentDocId) {
            currentDocId = await spreadsheet.createSpreadsheet(sheets, docTitle, date);
        }

        const { sheetId, title } = await spreadsheet.findOrCreateSheet(sheets, currentDocId, date);
        await spreadsheet.addStaticData(sheets, currentDocId, LIST_SIZE, LIST_FILE, sheetId, title);
        await spreadsheet.addBugData(sheets, currentDocId, bugTable, title);
        await spreadsheet.updateSummary(sheets, currentDocId, date);
        // now, set the current document to a clone (to become the new current document).
        // this way have a fresh one to start with next iteration.
        oldDocId = currentDocId;
        currentDocId = await spreadsheet.cloneDocument(drive, currentDocId);
        console.log(`Cloning current document into document with id: ${currentDocId}`);
        await spreadsheet.updateTitle(sheets, currentDocId);

        // delete the old one, because we don't need it anymore.
        console.log(`Deleting cloned document with id: ${oldDocId}`);
        await drive.files.delete({fileId: oldDocId});

        for (const writer of writers) {
            await spreadsheet.shareSheet(drive, currentDocId, writer);
        }

        console.log(`Current document ► https://docs.google.com/spreadsheets/d/${currentDocId}/edit`);
        await helpers.recordCurrentDoc(currentDocId);
    }
}

main();
