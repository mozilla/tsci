const { google } = require('googleapis');
const tranco = require('./tranco');
const spreadsheet = require('./spreadsheet');
const bugs = require('./bugs');

const argv = process.argv.slice(2);

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

/**
 * Return the list of query dates for a given inputDate
 * @param {Date} inputDate the date to start with.
 * @returns an Array with all dates to gather bugs for
 */
function getQueryDates(inputDate) {
    const queryDates = [];
    if (inputDate) {
        // We want to consider open bugs only until the end of the given week.
        const parsed = new Date(inputDate);
        const today = new Date();
        if (isNaN(parsed)) {
            throw new Error("Wrong maxDate format: use yyyy-mm-dd");
        }

        if (!inputDate.includes("-")) {
            // An entire year is specified.
            for (let i = 0; i < 52; i++) {
                queryDates.push(getEOW(parsed));
                parsed.setDate(parsed.getDate() + 7);
                if (getEOW(parsed) > today) {
                    // Stop if we get into future dates (the Tranco list won't
                    // have anything useful for us).
                    break;
                }
            }
        } else if (inputDate.indexOf("-") === inputDate.lastIndexOf("-")) {
            // An entire month is specified.
            const month = getEOW(parsed).getMonth();
            for (let i = 0; i < 5; i++) {
                queryDates.push(getEOW(parsed));
                parsed.setDate(parsed.getDate() + 7);
                if (getEOW(parsed).getMonth() !== month || getEOW(parsed) > today) {
                    // Stop if the fifth consecutive Sunday falls into the next
                    // month, or we get into future dates.
                    break;
                }
            }
        } else {
            // A single date is specified.
            queryDates.push(getEOW(parsed));
        }
    } else {
        queryDates.push(inputDate);
    }

    return queryDates;
}

/**
 * Return the list of query dates until the present, starting
 * at the specified date.
 * @param {Date} inputDate the date to resume with
 * @returns an Array with all dates to gather bugs for
 */
function resumeQueryDates(inputDate) {
    const queryDates = [];
    const parsed = new Date(inputDate);
    const today = new Date();
    if (isNaN(parsed)) {
        throw new Error("Wrong maxDate format: use yyyy-mm-dd");
    }
    while(getEOW(parsed) < today) {
        queryDates.push(getEOW(parsed));
        parsed.setDate(parsed.getDate() + 7);
    }

    return queryDates;
}

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
        queryDates = resumeQueryDates(inputDate);
    } else {
        queryDates = getQueryDates(inputDate);
    }

    for (const date of queryDates) {
        const LIST_FILE = await tranco.fetchList(LIST_SIZE, LIST_DIR, date);
        const bugTable = await bugs.fetchBugs(LIST_FILE, bugzillaKey, githubKey, parsedMinDate, date);
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
