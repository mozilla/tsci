const fs = require('fs');
const readline = require('readline');

const valueInputOption = 'USER_ENTERED';

async function createSpreadsheet(sheets, title) {
    const resource = {
        properties: {
            title,
        },
    }
    const { data } = await sheets.spreadsheets.create({ resource });
    const spreadsheetId = data.spreadsheetId;
    const sheetId = data.sheets[0].properties.sheetId;
    // For new spreadsheets, the first sheet is always Summary
    const sheetTitle = "Summary";
    const summaryHeaders = ["Date", "bugzilla", "bugzilla-M", "bugzilla-D", "wc",
        "wc-M", "wc-D", "criticals", "criticals-M", "criticals-D", "duplicates",
        "duplicates-M", "duplicates-D", "Non-weighted TSCI", "Non-weighted TSCI-M",
        "Non-weighted TSCI-D", "TSCI", "TSCI-M", "TSCI-D",
    ];

    // Fix sheet name.
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
            requests: [{
                "updateSheetProperties": {
                    "properties": {
                        sheetId,
                        title: sheetTitle,
                    },
                    "fields": "title",
                },
            }],
        },
    });

    // Add headers for Summary.
    await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `Summary!A1:S1`,
        resource: {
            values: [summaryHeaders],
        },
        valueInputOption,
    });

    // Center the cells
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId,
        resource: {
            requests: [{
                "repeatCell": {
                    "range": {
                        "sheetId": sheetId,
                        "startRowIndex": 0,
                        "endRowIndex": 1,
                    },
                    "cell": {
                        "userEnteredFormat": {
                            "horizontalAlignment" : "CENTER",
                        },
                    },
                    "fields": "userEnteredFormat.horizontalAlignment",
                },
            }],
        },
    });

    await findOrCreateSheet(sheets, spreadsheetId, null, "Chart");
    await findOrCreateSheet(sheets, spreadsheetId, null, "Formula");

    // now move the Summary to the 3rd spot.
    // This makes linking to the Chart simpler, since we don't have to worry
    // about unpredictable hashes, i.e. #gid=1805032422
    // [ Chart ][ Formula ][ Summary ][ Week N ]([ Week N -1 ]...)
    await moveSheet(sheets, spreadsheetId, "Summary", 2);

    console.log(`Created new spreadsheet with ID: ${spreadsheetId}`);
    return spreadsheetId;
}

async function moveSheet(sheets, spreadsheetId, dateOrTitle, index) {
    // This is sort of an ugly hack to make this more re-usable...
    const title = dateOrTitle === "Summary" ? dateOrTitle : getSheetTitle(dateOrTitle);
    const result = await sheets.spreadsheets.get({
        spreadsheetId,
    });

    let sheetId;
    for (const { properties } of result.data.sheets) {
        if (properties.title !== title) {
            continue;
        }
        sheetId = properties.sheetId;

        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [{
                    updateSheetProperties: {
                        properties: {
                            sheetId,
                            index,
                        },
                        fields: "index",
                    },
                }],
            },
        });
    }
}

async function updateSummary(sheets, spreadsheetId, date) {
    const title = getSheetTitle(date);
    let result = await sheets.spreadsheets.get({
        spreadsheetId,
    });

    let sheetId;
    for (const { properties } of result.data.sheets) {
        if (properties.title !== "Summary") {
            continue;
        }
        sheetId = properties.sheetId;
        const requests = [];
        const range = {
            "sheetId": sheetId,
            "startRowIndex": 1,
            "endRowIndex": 2,
            "startColumnIndex": 0,
            "endColumnIndex": 19,
        };

        // Insert new row.
        requests.push({
            "insertRange": {
                range,
                "shiftDimension": 'ROWS',
            },
        });
        const batchUpdateRequest = { requests };

        result = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: batchUpdateRequest,
        });

        const summary = [
            `=DATEVALUE("${title}")`,
            `='${title}'!$C$1`,
            `='${title}'!$D$1`,
            `='${title}'!$E$1`,
            `='${title}'!$F$1`,
            `='${title}'!$G$1`,
            `='${title}'!$H$1`,
            `='${title}'!$I$1`,
            `='${title}'!$J$1`,
            `='${title}'!$K$1`,
            `='${title}'!$L$1`,
            `='${title}'!$M$1`,
            `='${title}'!$N$1`,
            `='${title}'!$P$1`,
            `='${title}'!$Q$1`,
            `='${title}'!$R$1`,
            `='${title}'!$T$1`,
            `='${title}'!$U$1`,
            `='${title}'!$V$1`,
        ];
        result = await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `Summary!A2:S2`,
            resource: {
                values: [summary],
            },
            valueInputOption,
        });

        // format the first column as a date
        await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [{
                    "repeatCell": {
                        "range": {
                            "sheetId": sheetId,
                            "startColumnIndex": 0,
                            "endColumnIndex": 1,
                            "startRowIndex": 1,
                        },
                        "cell": {
                            "userEnteredFormat": {
                                "numberFormat": {
                                    "type": "DATE",
                                    "pattern": "yyyy/mm/dd",
                                },
                            },
                        },
                        "fields": "userEnteredFormat.numberFormat",
                    },
                }],
            },
        });

        console.log(`Updated summary sheet for date ${title}`);
        break;
    }
}

async function addBugData(sheets, spreadsheetId, bugTable, title) {
    let result = await sheets.spreadsheets.get({
        spreadsheetId,
    });
    const valueInputOption = 'USER_ENTERED';

    const bugzilla = bugTable.get("bugzilla");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!C3:C${bugzilla.length + 2}`,
        resource: {
            values: [bugzilla],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated bugzilla cells: ' + result.data.updatedCells);

    const bugzillaMobile = bugTable.get("bugzillaMobile");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!D3:D${bugzillaMobile.length + 2}`,
        resource: {
            values: [bugzillaMobile],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated bugzilla (mobile) cells: ' + result.data.updatedCells);

    const bugzillaDesktop = bugTable.get("bugzillaDesktop");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!E3:E${bugzillaDesktop.length + 2}`,
        resource: {
            values: [bugzillaDesktop],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated bugzilla (desktop) cells: ' + result.data.updatedCells);

    const webcompat = bugTable.get("webcompat");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!F3:F${webcompat.length + 2}`,
        resource: {
            values: [webcompat],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated webcompat cells: ' + result.data.updatedCells);

    const webcompatMobile = bugTable.get("webcompatMobile");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!G3:G${webcompatMobile.length + 2}`,
        resource: {
            values: [webcompatMobile],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated webcompat (mobile) cells: ' + result.data.updatedCells);

    const webcompatDesktop = bugTable.get("webcompatDesktop");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!H3:H${webcompatDesktop.length + 2}`,
        resource: {
            values: [webcompatDesktop],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated webcompat (Desktop) cells: ' + result.data.updatedCells);

    const criticals = bugTable.get("criticals");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!I3:I${criticals.length + 2}`,
        resource: {
            values: [criticals],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated criticals cells: ' + result.data.updatedCells);

    const criticalsMobile = bugTable.get("criticalsMobile");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!J3:J${criticalsMobile.length + 2}`,
        resource: {
            values: [criticalsMobile],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated criticals (mobile) cells: ' + result.data.updatedCells);

    const criticalsDesktop = bugTable.get("criticalsDesktop");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!K3:K${criticalsDesktop.length + 2}`,
        resource: {
            values: [criticalsDesktop],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated criticals (Desktop) cells: ' + result.data.updatedCells);

    const duplicates = bugTable.get("duplicates");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!L3:L${duplicates.length + 2}`,
        resource: {
            values: [duplicates],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated duplicates cells: ' + result.data.updatedCells);

    const duplicatesMobile = bugTable.get("duplicatesMobile");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!M3:M${duplicatesMobile.length + 2}`,
        resource: {
            values: [duplicatesMobile],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated duplicates (mobile) cells: ' + result.data.updatedCells);

    const duplicatesDesktop = bugTable.get("duplicatesDesktop");
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!N3:N${duplicatesDesktop.length + 2}`,
        resource: {
            values: [duplicatesDesktop],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated duplicates (Desktop) cells: ' + result.data.updatedCells);
}

async function findOrCreateSheet(sheets, spreadsheetId, maxDate, title) {
    let result = await sheets.spreadsheets.get({
        spreadsheetId,
    });
    // Construct the sheet title.
    title = title || getSheetTitle(maxDate);

    // Find the sheet to update...
    let sheetId;
    for (const sheet of result.data.sheets) {
        const { properties } = sheet;
        if (properties.title !== title) {
            continue;
        }
        sheetId = properties.sheetId;
        result = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [{
                    "updateCells": {
                        "range": {
                            sheetId,
                        },
                        "fields": "userEnteredValue",
                    },
                }],
            },
        });
        console.log(`Found and cleared sheet with ID ${sheetId}`);
        break;
    }
    // ... or create a new sheet.
    if (sheetId === undefined) {
        result = await sheets.spreadsheets.batchUpdate({
            spreadsheetId,
            resource: {
                requests: [{
                    "addSheet": {
                        "properties": {
                            title,
                        },
                    },
                }],
            },
        });
        sheetId = result.data.replies[0].addSheet.properties.sheetId;
        console.log(`Added sheet with ID ${sheetId}`);
    }
    return {
        sheetId,
        title,
    }
}

async function addStaticData(sheets, spreadsheetId, listSize, listFile = 'data/list.csv', sheetId, title) {
    let result = await sheets.spreadsheets.get({
        spreadsheetId,
    });

    const valueInputOption = 'USER_ENTERED';
    const requests = [];
    const range = {
        "sheetId": sheetId,
        "startRowIndex": 0,
        "endRowIndex": 1,
        "startColumnIndex": 0,
        "endColumnIndex": 2,
    };

    const headers = ['Rank', 'Website', 'bugzilla', 'bugzilla-M', 'bugzilla-D',
        'webcompat.com', 'webcompat-M', 'webcompat-D', 'criticals', 'criticals-M',
        'criticals-D', 'duplicates', 'duplicates-M', 'duplicates-D', 'critical weight',
        'SCI', 'SCI-M', 'SCI-D','Site weight', 'Weighted SCI', 'Weighted SCI-M',
        'Weighted SCI-D'];

    // Insert totals row.
    requests.push({
        "insertRange": {
            range,
            "shiftDimension": 'ROWS',
        },
    });
    // Insert header row.
    requests.push({
        "insertRange": {
            range,
            "shiftDimension": 'ROWS',
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
        `=SUM(G3:G${listSize + 2})`,
        `=SUM(H3:H${listSize + 2})`,
        `=SUM(I3:I${listSize + 2})`,
        `=SUM(J3:J${listSize + 2})`,
        `=SUM(K3:K${listSize + 2})`,
        `=SUM(L3:L${listSize + 2})`,
        `=SUM(M3:M${listSize + 2})`,
        `=SUM(N3:N${listSize + 2})`,
        "",
        `=SUM(P3:P${listSize + 2})`,
        `=SUM(Q3:Q${listSize + 2})`,
        `=SUM(R3:R${listSize + 2})`,
        "",
        `=SUM(T3:T${listSize + 2})`,
        `=SUM(U3:U${listSize + 2})`,
        `=SUM(V3:V${listSize + 2})`,
    ];
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A1:V1`,
        resource: {
            values: [totals],
        },
        valueInputOption,
    })
    console.log('Updated totals cell: ' + result.data.updatedCells);

    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A2:V2`,
        resource: {
            values: [headers],
        },
        valueInputOption,
    })
    console.log('Updated header cells: ' + result.data.updatedCells);

    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!O3`,
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
        range: `${title}!S3:S${listSize+2}`,
        resource: {
            values: [weights],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated site weight cells: ' + result.data.updatedCells);

    const sci = [];
    for (let i = 2; i < listSize + 2; i++) {
        sci.push(`=(C${i + 1} + F${i + 1} + L${i + 1}) + (I${i + 1} * $O$3)`)
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!P3:P${listSize + 2}`,
        resource: {
            values: [sci],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated SCI cells: ' + result.data.updatedCells);

    const mobileSci = [];
    for (let i = 2; i < listSize + 2; i++) {
        mobileSci.push(`=(D${i + 1} + G${i + 1} + M${i + 1}) + (J${i + 1} * $O$3)`)
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!Q3:Q${listSize + 2}`,
        resource: {
            values: [mobileSci],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated SCI (mobile) cells: ' + result.data.updatedCells);

    const desktopSci = [];
    for (let i = 2; i < listSize + 2; i++) {
        desktopSci.push(`=(E${i + 1} + H${i + 1} + N${i + 1}) + (K${i + 1} * $O$3)`)
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!R3:R${listSize + 2}`,
        resource: {
            values: [desktopSci],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    })
    console.log('Updated SCI (desktop) cells: ' + result.data.updatedCells);

    const wsci = [];
    for (let i = 2; i < listSize + 2; i++) {
        wsci.push(`=P${i + 1}*S${i + 1}`)
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!T3:T${listSize + 2}`,
        resource: {
            values: [wsci],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    });
    console.log('Updated weighted SCI cells: ' + result.data.updatedCells);

    const mobileWsci = [];
    for (let i = 2; i < listSize + 2; i++) {
        mobileWsci.push(`=Q${i + 1}*S${i + 1}`)
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!U3:U${listSize + 2}`,
        resource: {
            values: [mobileWsci],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    });
    console.log('Updated weighted SCI (mobile) cells: ' + result.data.updatedCells);

    const desktopWsci = [];
    for (let i = 2; i < listSize + 2; i++) {
        desktopWsci.push(`=R${i + 1}*S${i + 1}`)
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!V3:V${listSize + 2}`,
        resource: {
            values: [desktopWsci],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    });
    console.log('Updated weighted SCI (desktop) cells: ' + result.data.updatedCells);

    // Load the website list.
    const fileStream = fs.createReadStream(listFile);
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity,
    });

    const ranks = [];
    const websites = [];
    let i = 0;
    for await (const line of rl) {
        const [ rank, website ] = line.split(',');
        ranks.push(rank);
        websites.push(website);
        if (++i >= listSize) {
            break;
        }
    }
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!A3:A${listSize + 2}`,
        resource: {
            values: [ranks],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    });
    console.log('Updated rank cells: ' + result.data.updatedCells);
    result = await sheets.spreadsheets.values.update({
        spreadsheetId,
        range: `${title}!B3:B${listSize + 2}`,
        resource: {
            values: [websites],
            majorDimension: "COLUMNS",
        },
        valueInputOption,
    });
    console.log('Updated website cells: ' + result.data.updatedCells);
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

/**
 * Return the title of the sheet for the specified date.
 * @param {Date} date the date of the sheet
 * @returns a String with the sheet title
 */
function getSheetTitle(date) {
    if (!date) {
        date = new Date();
    }
    return `${date.getFullYear()}/${(date.getMonth() + 1)}/${date.getDate()}`;
}

/**
 * Copy a Google drive document for the given ID and return
 * the ID of the copy.
 */
async function cloneDocument(drive, id) {
    const copy = await drive.files.copy({fileId: id});
    return copy.data.id;
}

/**
 * Prevent ending up with "Copy of" in the document title.
 */
async function updateTitle(sheets, documentId) {
    await sheets.spreadsheets.batchUpdate({
        spreadsheetId: documentId,
        resource: {
            requests: [{
                "updateSpreadsheetProperties": {
                    "properties": {
                        title: "Top Site Compatibility Index",
                    },
                    "fields": "title",
                },
            }],
        },
    });
}

/*
  Update the Google Sheet to be "published", which will allow
  us to embed it as an iframe. Once it's published, it can be embedded
  as the following URL:

  `https://docs.google.com/spreadsheets/u/1/d/${currentDocId}/pubhtml?widget=true&headers=false&embedded=true`
*/
async function publishSheet(drive, fileId) {
    return drive.revisions.update({
        fileId,
        revisionId: 1,
        requestBody: {
            published: true,
            publishAuto: true,
        },
    });
  }

module.exports = {
    addBugData,
    addStaticData,
    cloneDocument,
    createSpreadsheet,
    findOrCreateSheet,
    moveSheet,
    publishSheet,
    shareSheet,
    updateSummary,
    updateTitle,
}
