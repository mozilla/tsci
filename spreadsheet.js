const fs = require('fs');

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
                resolve(file.data.id);
            }
        });
    });

    console.log(`Created new spreadsheet with ID: ${spreadsheetId}`);
    return spreadsheetId;
}

async function addBugData(sheets, spreadsheetId, bugTable) {
    let result = await sheets.spreadsheets.get({
        spreadsheetId,
    });
    const valueInputOption = 'USER_ENTERED';

    const bugzilla = bugTable.get("bugzilla");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `C3:C${bugzilla.length + 2}`,
        resource: {
            values: [bugzilla],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated bugzilla cells: ' + result.data.updatedCells);

    const webcompat = bugTable.get("webcompat");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `D3:D${webcompat.length + 2}`,
        resource: {
            values: [webcompat],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated webcompat cells: ' + result.data.updatedCells);

    const criticals = bugTable.get("criticals");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `E3:E${criticals.length + 2}`,
        resource: {
            values: [criticals],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated criticals cells: ' + result.data.updatedCells);

    const duplicates = bugTable.get("duplicates");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `F3:F${duplicates.length + 2}`,
        resource: {
            values: [duplicates],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated duplicates cells: ' + result.data.updatedCells);
}

async function addStaticData(sheets, spreadsheetId, listSize, maxDate) {
    let result = await sheets.spreadsheets.get({
        spreadsheetId,
    });
    const { properties } = result.data.sheets[0]
    const sheetId = properties.sheetId;
    const valueInputOption = 'USER_ENTERED';
    const requests = [];
    const range = {
        "sheetId": sheetId,
        "startRowIndex": 0,
        "endRowIndex": 1,
        "startColumnIndex": 0,
        "endColumnIndex": 2
    };
    const headers = ['Rank', 'Website', 'bugzilla', 'webcompat.com',
        'criticals', 'duplicates', 'critical weight', 'SCI', 'Site weight', 'Weighted SCI'];

    // Fix sheet name.
    if (!maxDate) {
        maxDate = new Date();
    }
    const title = `${maxDate.getFullYear()}/${(maxDate.getMonth() + 1)}/${maxDate.getDate()}`;
    requests.push({
        "updateSheetProperties": {
            "properties": {
                "sheetId": sheetId,
                title,
            },
            "fields": "title"
        },
    });
    // Insert totals row.
    requests.push({
        "insertRange": {
            range,
            "shiftDimension": 'ROWS'
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


    const totals = [
        "Total",
        "",
        `=SUM(C3:C${listSize + 2})`,
        `=SUM(D3:D${listSize + 2})`,
        `=SUM(E3:E${listSize + 2})`,
        `=SUM(F3:F${listSize + 2})`,
        "",
        `=SUM(H3:H${listSize + 2})`,
        "",
        `=SUM(J3:J${listSize + 2})`
    ];
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `A1:J1`,
        resource: {
            values: [totals],
        },
        valueInputOption,
    })
    console.log('Updated totals cell: ' + result.data.updatedCells);

    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "A2:J2",
        resource: {
            values: [headers],
        },
        valueInputOption,
    })
    console.log('Updated header cells: ' + result.data.updatedCells);

    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: "G3",
        resource: {
            values: [['25%']],
        },
        valueInputOption,
    })
    console.log('Updated critical weight cell: ' + result.data.updatedCells);

    const weights = [];
    for (let i = 2; i < listSize + 2; i++) {
        weights.push(`=1/A${i+1}`)
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `I3:I${listSize+2}`,
        resource: {
            values: [weights],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated site weight cells: ' + result.data.updatedCells);

    const sci = [];
    for (let i = 2; i < listSize + 2; i++) {
        sci.push(`=(C${i + 1} + D${i + 1} + F${i + 1}) + (E${i + 1} * $G$3)`)
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `H3:H${listSize + 2}`,
        resource: {
            values: [sci],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated SCI cells: ' + result.data.updatedCells);

    const wsci = [];
    for (let i = 2; i < listSize + 2; i++) {
        wsci.push(`=H${i + 1}*I${i + 1}`)
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `J3:J${listSize + 2}`,
        resource: {
            values: [wsci],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated weighted SCI cells: ' + result.data.updatedCells);
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

module.exports = {
    addBugData,
    addStaticData,
    createSpreadsheet,
    shareSheet,
}
