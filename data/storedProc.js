/**
 * FIRESTORE (MONGODB COMPATIBILITY) STORED PROCEDURES
 * Dynamically converted via QueryTranslationPipelinePOC + pipeline.js
 */

async function RAQ_CustomReportSave_V1(collection, session, userId, title, item) {
try {

        // Step 1: Check for document count
        

        // Translated by QueryTranslationPipelinePOC (id=RAQ_CustomReportSave_V1__countQuery, shim=UnwrapCount)
const _countQueryRows = await collection.aggregate([
    {
        "$match": {
            "UserId": {
                "$eq": userId,
                "$not": {
                    "$type": "array"
                }
            }
        }
    },
    {
        "$group": {
            "_id": null,
            "COUNT": {
                "$sum": 1
            }
        }
    },
    {
        "$project": {
            "COUNT": 1,
            "_id": 0
        }
    }
], { session }).toArray();
const documents = [_countQueryRows.length ? _countQueryRows[0].COUNT : 0];
const docCount = documents[0];
                console.log("Documents saved by current user :" + docCount + "\n");

                // Return 403 if the document count is greater than 500
                if (docCount > 500) {
                    return { StatusCode: 406, Message: "User has exceeded document limit." };
                }

                // Step 2: Check for duplicate title
                

                // Translated by QueryTranslationPipelinePOC (id=RAQ_CustomReportSave_V1__titleQuery, shim=UnwrapCount)
const _titleQueryRows = await collection.aggregate([
    {
        "$match": {
            "UserId": {
                "$eq": userId,
                "$not": {
                    "$type": "array"
                }
            },
            "Name": {
                "$eq": title,
                "$not": {
                    "$type": "array"
                }
            }
        }
    },
    {
        "$group": {
            "_id": null,
            "COUNT": {
                "$sum": 1
            }
        }
    },
    {
        "$project": {
            "COUNT": 1,
            "_id": 0
        }
    }
], { session }).toArray();
const titleDocuments = [_titleQueryRows.length ? _titleQueryRows[0].COUNT : 0];
const titleCount = titleDocuments[0];

                        console.log("Documents saved with this title:" + titleCount);

                        // Return 409 if the title already exists
                        if (titleCount > 0) {
                            return {
                                    StatusCode: 409,
                                    Message: "Document with this title already exists."
                                };
                        }

                        const createdDoc = { _id: String(item.id), ...item };
await collection.insertOne(createdDoc, { session });
// Success: Document created
                                return {
                                    StatusCode: 201,
                                    Message: "Document created successfully.",
                                    Document: createdDoc
                                };
    } catch (err) {
        return {
            status: "Error",
            message: err.message,
            stack: err.stack
        };
    }
}

async function RAQ_CustomReportUpdate_V1(collection, session, id, userId, title, item) {
try {

        

        // Translated by QueryTranslationPipelinePOC (id=RAQ_CustomReportUpdate_V1__itemSearchQuery, shim=None)
const documents = await collection.aggregate([
    {
        "$match": {
            "UserId": {
                "$eq": userId,
                "$not": {
                    "$type": "array"
                }
            },
            "id": {
                "$eq": id,
                "$not": {
                    "$type": "array"
                }
            }
        }
    }
], { session }).toArray();
if (documents.length < 1) {
                    return { StatusCode: 404, Message: "Document with this id not found." };
                }

                const itemRef = documents[0];

                console.log("Item found with id: " + itemRef.id + "\n");

                // Step 1: Check for duplicate title
                

                // Translated by QueryTranslationPipelinePOC (id=RAQ_CustomReportUpdate_V1__titleQuery, shim=UnwrapCount)
const _titleQueryRows = await collection.aggregate([
    {
        "$match": {
            "id": {
                "$exists": true,
                "$ne": id
            },
            "UserId": {
                "$eq": userId,
                "$not": {
                    "$type": "array"
                }
            },
            "Name": {
                "$eq": title,
                "$not": {
                    "$type": "array"
                }
            }
        }
    },
    {
        "$group": {
            "_id": null,
            "COUNT": {
                "$sum": 1
            }
        }
    },
    {
        "$project": {
            "COUNT": 1,
            "_id": 0
        }
    }
], { session }).toArray();
const titleDocuments = [_titleQueryRows.length ? _titleQueryRows[0].COUNT : 0];
const titleCount = titleDocuments[0];

                        console.log("Items with the same title: " + titleCount + "\n");

                        // Return 409 if the title already exists
                        if (titleCount > 0) {
                            return {
                                    StatusCode: 409,
                                    Message: "Document with this title already exists."
                                };
                        }

                        const createdDoc = { _id: String(item.id), ...item };
await collection.replaceOne({ _id: String(itemRef.id) }, createdDoc, { session });
// Success: Document created
                                return {
                                    StatusCode: 201,
                                    Message: "Document replaced successfully.",
                                    Document: createdDoc
                                };
    } catch (err) {
        return {
            status: "Error",
            message: err.message,
            stack: err.stack
        };
    }
}

async function upsertDocument(collection, session, dto, toDelete, toAdd) {
var id = dto.id;
    var partitionKey = dto.partitionKey;
    var lastModifiedTimestamp = dto.lastModified;
    var documentLink = (collection.collectionName || "sproc") + "/docs/" + id;
    var logs = [];
    var oldDocument = null;

    var addToLogs = function (msg) {
        logs.push(msg);
    };

    var addErrorToLogs = function (msg, err) {
        addToLogs(msg + (err !== undefined ? JSON.stringify(err) : ""));
    };

    var makeSureDtoHasSettingDict = function (rawDto) {
        if (!rawDto.settings) {
            rawDto.settings = {};
        }
    };
    addToLogs(
        `Starting the upsert process for PK: ${partitionKey}, DocId: ${id}, ToDelete: ${JSON.stringify(toDelete)}, ToAdd: ${JSON.stringify(toAdd)}`
    );
    let document;
try {
    document = await collection.findOne({ _id: String(id), partitionKey: partitionKey }, { session });
} catch (err) {
    addErrorToLogs("Error reading document:", err);
    addErrorToLogs(
                        `Error reading document PK: ${partitionKey} and Document: ${documentLink}. Error: ${JSON.stringify(err)}`
                    );
                    return {
                            StatusCode: 500,
                            ErrorMessage: `Errors : [ Error reading document PK: ${partitionKey} and Document: ${documentLink}. Error: ${JSON.stringify(err)} ]`
                        };
}
if (document === null) {
    makeSureDtoHasSettingDict(dto);
                    return await insertDocument(dto, toAdd);
} else {
    oldDocument = JSON.parse(JSON.stringify(document));
                makeSureDtoHasSettingDict(dto);
                return await patchDocument(document, dto, toDelete, toAdd);
}

    async function insertDocument(newDto, toAdd) {
        addToLogs("inserting new document...");
        // Ensure DataVersion is properly assigned
        if (!newDto.dataVersion || newDto.dataVersion === "") {
            newDto.dataVersion = 1; // Default value if null or empty
        } else {
            try {
                // Convert to a Number and validate
                let parsedValue = Number(newDto.dataVersion);
                if (!Number.isSafeInteger(parsedValue)) {
                    addErrorToLogs(
                        "The parsed value " +
                            parsedValue +
                            " for the input dataversion " +
                            newDto.dataVersion +
                            " is not a safe integer"
                    );
                    return {
                            StatusCode: 500,
                            ErrorMessage: `Errors : [ Invalid DataVersion input ${newDto.dataVersion}]`
                        };
                }
                newDto.dataVersion = parsedValue; // Store as a Number
            } catch (error) {
                addErrorToLogs(
                    "Invalid DataVersion value: " +
                        newDto.dataVersion +
                        " or failed to convert to js number"
                );
                return {
                        StatusCode: 500,
                        ErrorMessage: `Errors : [ Invalid DataVersion input ${newDto.dataVersion}]`
                    };
            }
        }
        newDto.settings = toAdd;
        const newDocument = { _id: String(newDto.id), ...newDto };
await collection.insertOne(newDocument, { session });
addToLogs("inserted new document successfully...");
                return {
                    status: "Inserted",
                    statusCode: 200,
                    oldDocument: null, // No old document exists
                    newDocument: newDocument, // New document created
                    logs: logs
                };
    }

    async function patchDocument(existingDocument, newDto, toDelete, toAdd) {
        addToLogs("patching new document.");
        existingDocument.lastModified = newDto.lastModified;
        // Extract existing DataVersion
        let existingDataVersion =
            existingDocument.dataVersion !== undefined
                ? Number(existingDocument.dataVersion)
                : null;
        addToLogs("Existing document dataversion .." + existingDataVersion);
        // Validate incoming DataVersion if provided
        if (newDto.dataVersion && newDto.dataVersion !== "") {
            let incomingDataVersion = Number(newDto.dataVersion);
            if (!Number.isSafeInteger(incomingDataVersion)) {
                addErrorToLogs(
                    "The parsed value " +
                        incomingDataVersion +
                        " for the input dataversion " +
                        newDto.dataVersion +
                        " is not a safe integer"
                );
                return {
                        StatusCode: 500,
                        ErrorMessage: `Errors : [ Invalid DataVersion input ${newDto.dataVersion}]`
                    };
            }
            // Ensure incoming DataVersion is not lower than existing
            if (existingDataVersion !== null && incomingDataVersion < existingDataVersion) {
                return {
                        StatusCode: 409,
                        ErrorMessage: `Errors : [ Incoming DataVersion ${incomingDataVersion} must be >= existing DataVersion ${existingDataVersion} ]`
                    };
            }
            existingDocument.dataVersion = incomingDataVersion; // Store as Number
        } else {
            // If no incoming DataVersion, keep the dataVersion in db record untouched
            existingDocument.dataVersion = existingDataVersion;
        }
        if (toDelete && toDelete.length > 0 && existingDocument.settings) {
            addToLogs("deleting default keys successfully...");
            toDelete.forEach(function (key) {
                delete existingDocument.settings[key];
                if (
                    existingDocument.settingsLastModified &&
                    existingDocument.settingsLastModified[key]
                ) {
                    delete existingDocument.settingsLastModified[key];
                }
            });
            addToLogs("deleted default keys successfully.");
        }
        if (toAdd && Object.keys(toAdd).length > 0) {
            var settings = existingDocument.settings || {};
            var settingsLastModified = existingDocument.settingsLastModified || {};
            var newDtoSettingsLastModified = newDto.settingsLastModified || {}; // Handle case when it's missing
            for (var key of Object.keys(toAdd)) {
                settings[key] = toAdd[key];
                if (Object.prototype.hasOwnProperty.call(newDtoSettingsLastModified, key)) {
                    addToLogs(
                        `attempting to add lastmodified info.. ${key} with value ${newDtoSettingsLastModified[key]}`
                    );
                    settingsLastModified[key] = newDtoSettingsLastModified[key];
                }
            }
            existingDocument.settings = settings;
            // Persist settingsLastModified only if it's not empty
            if (Object.keys(settingsLastModified).length > 0) {
                existingDocument.settingsLastModified = settingsLastModified;
            } else {
                delete existingDocument.settingsLastModified;
            }
            addToLogs("Patched settings keys with new keys.");
        }
        const updatedDocument = { _id: String(existingDocument.id), ...existingDocument };
await collection.replaceOne({ _id: String(existingDocument.id) }, updatedDocument, { session });
addToLogs("Replaced document with new document.");
                return {
                    status: "Updated",
                    statusCode: 200,
                    oldDocument: oldDocument, // Old document before the update
                    newDocument: updatedDocument, // Updated document
                    logs: logs
                };
    }
}

async function deleteSettingFieldFromDocument(collection, session, dto, settingFieldsToDelete) {
var id = dto.id;
    var partitionKey = dto.partitionKey;
    var documentLink = (collection.collectionName || "sproc") + "/docs/" + id;
    var logs = [];
    var oldDocument = null;
    var addToLogs = function (msg) {
        logs.push(msg);
    };
    var addErrorToLogs = function (msg, err) {
        addToLogs(msg + (err !== undefined ? JSON.stringify(err) : ""));
    };
    var makeSureDtoHasSettingDict = function (rawDto) {
        if (!rawDto.settings) {
            rawDto.settings = {};
        }
        if (!rawDto.settingsLastModified) {
            rawDto.settingsLastModified = {};
        }
    };
    addToLogs(
        `Starting the delete setting field process for PK: ${partitionKey}, DocId: ${id}, ToDelete: ${JSON.stringify(settingFieldsToDelete)}`
    );
    let document;
try {
    document = await collection.findOne({ _id: String(id), partitionKey: partitionKey }, { session });
} catch (err) {
    addErrorToLogs("Error reading document:", err);
    addErrorToLogs(
                        `Error reading document PK: ${partitionKey} and Document: ${documentLink}. Error: ${JSON.stringify(err)}`
                    );
                    return {
                            StatusCode: 500,
                            ErrorMessage: `Errors : [ Error reading document PK: ${partitionKey} and Document: ${documentLink}. Error: ${JSON.stringify(err)} ]`
                        };
}
if (document === null) {
    addToLogs(
                        `Document not found for PK: ${partitionKey}, DocId: ${id}. Returning input document.`
                    );
                    makeSureDtoHasSettingDict(dto);
                    return {
                        StatusCode: 200,
                        status: "No changes - document did not exist",
                        oldDocument: dto,
                        newDocument: dto,
                        logs: logs
                    };
} else {
    oldDocument = JSON.parse(JSON.stringify(document));
                makeSureDtoHasSettingDict(dto);
                return await deleteSettingField(document, dto, settingFieldsToDelete);
}
    async function deleteSettingField(existingDocument, newDto, settingFieldsToDelete) {
        addToLogs("Finding if requested setting fields to be deleted exist in the document");
        var missingKeys = [];
        settingFieldsToDelete.forEach(function (key) {
            if (
                !existingDocument.settings ||
                !Object.prototype.hasOwnProperty.call(existingDocument.settings, key)
            ) {
                missingKeys.push(key);
            }
        });
        try {
            if (missingKeys.length > 0) {
                addErrorToLogs(
                    `Aborting delete: Missing settings found for keys: ${missingKeys.join(", ")}`
                );
                return {
                        StatusCode: 404,
                        ErrorMessage: `Errors : [ No settings found for : ${missingKeys.join(", ")} ]`
                    };
            }
        } catch (err) {
            addErrorToLogs(`printing err message ${err}`);
            throw err.message;
        }
        // Extract existing DataVersion
        let existingDataVersion =
            existingDocument.dataVersion !== undefined
                ? Number(existingDocument.dataVersion)
                : null;
        // Validate incoming DataVersion if provided
        if (newDto.dataVersion && newDto.dataVersion !== "") {
            let incomingDataVersion = Number(newDto.dataVersion);
            if (!Number.isSafeInteger(incomingDataVersion) || incomingDataVersion < 0) {
                addErrorToLogs(
                    "The parsed value " +
                        incomingDataVersion +
                        " for the input dataversion " +
                        newDto.dataVersion +
                        " is either not a safe integer or is less than zero"
                );
                return {
                        StatusCode: 500,
                        ErrorMessage: `Errors : [ Invalid DataVersion input ${newDto.dataVersion}]`
                    };
            }
            // Ensure incoming DataVersion is not lower than existing
            if (existingDataVersion !== null && incomingDataVersion < existingDataVersion) {
                addErrorToLogs("Incoming DataVersion must be >= existing DataVersion.");
                return {
                        StatusCode: 409,
                        ErrorMessage: `Errors : [ Incoming DataVersion ${incomingDataVersion} must be >= existing DataVersion ${existingDataVersion} ]`
                    };
            }
            existingDocument.dataVersion = incomingDataVersion; // Store as Number
        } else {
            // If no incoming DataVersion, keep the dataVersion in db record untouched
            existingDocument.dataVersion = existingDataVersion;
        }
        existingDocument.lastModified = newDto.lastModified;
        addToLogs("Attempting to delete setting fields");
        if (settingFieldsToDelete && settingFieldsToDelete.length > 0 && existingDocument.settings) {
            settingFieldsToDelete.forEach(function (key) {
                delete existingDocument.settings[key];
                if (existingDocument.settingsLastModified) {
                    delete existingDocument.settingsLastModified[key];
                }
            });
            addToLogs("Deleted specified setting fields successfully.");
        }
        const updatedDocument = { _id: String(existingDocument.id), ...existingDocument };
await collection.replaceOne({ _id: String(existingDocument.id) }, updatedDocument, { session });
addToLogs("Replaced document with new document.");
                return {
                    status: "Updated",
                    StatusCode: 200,
                    oldDocument: oldDocument, // Old document before the update
                    newDocument: updatedDocument, // Updated document
                    logs: logs
                };
    }
}

module.exports = {
    RAQ_CustomReportSave_V1,
    RAQ_CustomReportUpdate_V1,
    UpsertOrPatchDocument: upsertDocument,
    upsertDocument,
    DeleteSettingField: deleteSettingFieldFromDocument,
    deleteSettingFieldFromDocument
};
