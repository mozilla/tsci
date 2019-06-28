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
    const maxDate = config.maxDate || undefined;
    const minDate = config.minDate || "2018";
    let id = config.spreadsheetId;

    const parsedMinDate = new Date(minDate);
    if (isNaN(parsedMinDate)) {
        throw new Error("Wrong minDate format: use yyyy-mm-dd");
    }

    const inputDate = process.argv[2] || maxDate;
    if (inputDate) {
        // We want to consider open bugs only until the end of the given week.
        const parsed = new Date(inputDate);
        if (isNaN(parsed)) {
            throw new Error("Wrong maxDate format: use yyyy-mm-dd");
        }

        if (!inputDate.includes("-")) {
            // An entire year is specified.
            for (let i = 0; i < 52; i++) {
                queryDates.push(getEOW(parsed));
                parsed.setDate(parsed.getDate() + 7);
            }
        } else if (inputDate.indexOf("-") === inputDate.lastIndexOf("-")) {
            // An entire month is specified.
            const month = getEOW(parsed).getMonth();
            for (let i = 0; i < 5; i++) {
                queryDates.push(getEOW(parsed));
                parsed.setDate(parsed.getDate() + 7);
                if (getEOW(parsed).getMonth() !== month) {
                    // Stop if the fifth consecutive Sunday falls into the next
                    // month.
                    break;
                }
            }
        } else {
            queryDates.push(getEOW(parsed));
        }
    } else {
        queryDates.push(inputDate);
    }

    for (const date of queryDates) {
        const LIST_FILE = await tranco.fetchList(LIST_SIZE, LIST_DIR, date);
        const bugTable = await bugs.fetchBugs(LIST_FILE, bugzillaKey, githubKey, parsedMinDate, date);
        if (bugTable.get("bugzilla").length + bugTable.get("bugzillaMobile").length +
            bugTable.get("webcompat").length + bugTable.get("webcompatMobile").length +
            bugTable.get("criticals").length + bugTable.get("criticalsMobile").length +
            bugTable.get("duplicates").length + bugTable.get("duplicatesMobile").length === 0) {
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
        for (const writer of writers) {
            await spreadsheet.shareSheet(drive, id, writer);
            console.log(`► https://docs.google.com/spreadsheets/d/${id}/edit`)
        }
    }
}

main();
