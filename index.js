const { google } = require('googleapis');
const tranco = require('./tranco');
const spreadsheet = require('./spreadsheet');
const bugs = require('./bugs');

/**
 * Return the End of the week the specified date belongs to.
 * @param {Date} date the date for which to
 * @returns the date of the end of the week
 */
function getEOW(date) {
    const param = new Date(date);
    param.setDate(param.getDate() - param.getDay() + 7);
    return new Date(param - 1);
}

const main = async () => {
    const config = require('./config.json');
    const LIST_SIZE = config.listSize || 500;
    const LIST_DIR = config.listDir || 'data/';
    const bugzillaKey = config.bugzillaKey || '';
    const githubKey = config.githubKey || '';
    const writers = config.writers || ['user@example.com'];
    const queryDates = [];
    const maxDate = config.maxDate || null;

    const inputDate = process.argv[2] || maxDate;
    if (inputDate) {
        // We want to consider open bugs only until the end of the given week.
        const parsed = new Date(inputDate);
        if (isNaN(parsed)) {
            throw new Error("Wrong date format: use yyyy-mm-dd");
        }

        if (!inputDate.includes("-")) {
            // An entire year is specified.
            for (let i = 0; i < 52; i++) {
                queryDates.push(getEOW(parsed));
                parsed.setDate(parsed.getDate() + 7);
            }
        } else if (inputDate.indexOf("-") === inputDate.lastIndexOf("-")) {
            // An entire month is specified.
            for (let i = 0; i < 4; i++) {
                queryDates.push(getEOW(parsed));
                parsed.setDate(parsed.getDate() + 7);
            }
        } else {
            queryDates.push(getEOW(parsed));
        }
    } else {
        queryDates.push(inputDate);
    }

    for (const date of queryDates) {
        const LIST_FILE = await tranco.fetchList(LIST_SIZE, LIST_DIR, date);
        const bugTable = await bugs.fetchBugs(LIST_FILE, bugzillaKey, githubKey, undefined, date);
        if (bugTable.get("bugzilla").length +
            bugTable.get("webcompat").length +
            bugTable.get("criticals").length +
            bugTable.get("duplicates").length === 0) {
                console.warn("List was empty or malformed!");
                continue;
        }

        const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
        const auth = await google.auth.getClient({ scopes: SCOPES });
        const sheets = google.sheets({ version: 'v4', auth });
        const drive = google.drive({ version: 'v3', auth })

        const title = 'Top Site Compatibility Index';
        const id = await spreadsheet.createSpreadsheet(drive, title, LIST_FILE);
        await spreadsheet.addStaticData(sheets, id, LIST_SIZE, date);
        await spreadsheet.addBugData(sheets, id, bugTable);
        // TODO add a graph
        for (const writer of writers) {
            await spreadsheet.shareSheet(drive, id, writer);
        }
    }
}

main();
