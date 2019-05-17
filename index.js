const fs = require('fs');
const tranco = require('./tranco');
const { google } = require('googleapis');

const LIST_SIZE = 500;
const LIST_FILE = 'data/list.csv';

async function createSpreadsheet(drive, title, file) {
    const fileMetadata = {
        'name': title,
        'mimeType': 'application/vnd.google-apps.spreadsheet'
    };
    const media = {
        mimeType: 'text/csv',
        body: fs.createReadStream(file)
    };
    const spreadsheetId = await new Promise((resolve, reject) => {
        drive.files.create({
            resource: fileMetadata,
            media: media,
            fields: 'id'
        }, function (err, file) {
            if (err) {
                reject(err);
            } else {
                // console.log(file);
                resolve(file.data.id);
            }
        });
    });

    console.log(`Created new spreadsheet with ID: ${spreadsheetId}`);
    return spreadsheetId;
}

async function addStaticData(sheets, spreadsheetId) {
    let result = await sheets.spreadsheets.get({
        spreadsheetId,
    });
    const { properties } = result.data.sheets[0]
    const sheetId = properties.sheetId;
    const requests = [];
    const valueInputOption = 'USER_ENTERED';
    const range = {
        "sheetId": sheetId,
        "startRowIndex": 0,
        "endRowIndex": 1,
        "startColumnIndex": 0,
        "endColumnIndex": 2
    };
    const headers = ['Rank', 'Website', 'bugzilla 🐞s', 'webcompat.com 🐞s',
        'severity-critical 🐞s', 'duplicate 🐞s', 'critical weight', 'SCI', 'Site weight', 'Weighted SCI'];

    // Fix sheet name.
    const now = new Date();
    requests.push({
        "updateSheetProperties": {
            "properties": {
                "sheetId": sheetId,
                "title": (now.getMonth() + 1) + '/' + now.getDate(),
            },
            "fields": "title"
        },
    });
    // Insert header row.
    requests.push({
        "insertRange": {
            range,
            "shiftDimension": 'ROWS'
        },
    });

    const batchUpdateRequest = { requests };

    result = await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: batchUpdateRequest,
    });
    console.log('Inserted header row');

    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "A1:J1",
        resource: {
            values: [headers],
        },
        valueInputOption,
    })
    console.log('Updated header cells: ' + result.data.updatedCells);

    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "G2",
        resource: {
            values: [['25%']],
        },
        valueInputOption,
    })
    console.log('Updated critical weight cell: ' + result.data.updatedCells);

    const weights = [];
    for (let i=1; i<LIST_SIZE+1; i++) {
        weights.push(`=1/A${i+1}`)
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `I2:I${LIST_SIZE+1}`,
        resource: {
            values: [weights],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated site weight cells: ' + result.data.updatedCells);

    const sci = [];
    for (let i = 1; i < LIST_SIZE + 1; i++) {
        sci.push(`=(C${i + 1} + D${i + 1} + F${i + 1}) + (E${i + 1} * $G$2)`)
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `H2:H${LIST_SIZE + 1}`,
        resource: {
            values: [sci],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated SCI cells: ' + result.data.updatedCells);

    const wsci = [];
    for (let i = 1; i < LIST_SIZE + 1; i++) {
        wsci.push(`=H${i + 1}*I${i + 1}`)
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `J2:J${LIST_SIZE + 1}`,
        resource: {
            values: [wsci],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated weighted SCI cells: ' + result.data.updatedCells);

    const totals = [
        "Total",
        `=SUM(H2:H${LIST_SIZE + 1})`,
        "",
        `=SUM(J2:J${LIST_SIZE + 1})`
    ];
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `G${LIST_SIZE + 2}:J${LIST_SIZE + 2}`,
        resource: {
            values: [totals],
        },
        valueInputOption,
    })
    console.log('Updated totals cell: ' + result.data.updatedCells);
}

const shareSheet = async (drive, id, emailAddress) => {
    try {
        const { data } = await drive.permissions.create({
            fileId: id,
            type: 'user',
            resource: {
                type: 'user',
                role: 'writer',
                emailAddress,
                transferOwnership: false,
            },
        });
        console.log(`Permission Id: ${data.id}`);
    } catch (err) {
        console.log(`Failed sharing with ${emailAddress}`);
        console.log(err);
    }
}

const main = async () => {
    const SCOPES = ['https://www.googleapis.com/auth/drive.file'];
    await tranco.fetchList(LIST_SIZE, LIST_FILE);
    const auth = await google.auth.getClient({ scopes: SCOPES });
    const sheets = google.sheets({ version: 'v4', auth });
    const drive = google.drive({ version: 'v3', auth })

    const title = 'Top Site Compatibility Index';
    const id = await createSpreadsheet(drive, title, LIST_FILE);
    await addStaticData(sheets, id);
    // fetch bugs and webcompat.com reports
    // add them to the spreadsheet
    // add a graph
    await shareSheet(drive, id, 'pastith@gmail.com');
}

main();
