/**
 * COSMOS DB STORED PROCEDURES (CANONICAL CUSTOMER SCRIPTS)
 * File: sproc_adk_agent/samples/cosmosStoredProc.js
 *
 * Exact customer Cosmos DB stored procedures using getContext():
 *   1. RAQ_CustomReportSave_V1(userId, title, item)
 *   2. RAQ_CustomReportUpdate_V1(id, userId, title, item)
 *   3. upsertDocument(dto, toDelete, toAdd) [UpsertOrPatchDocument]
 *   4. deleteSettingFieldFromDocument(dto, settingFieldsToDelete) [DeleteSettingField]
 */

function RAQ_CustomReportSave_V1(userId, title, item) {
    try {
        var context = getContext();
        var collection = context.getCollection();
        var response = context.getResponse();

        // Step 1: Check for document count
        var countQuery = {
            query: "SELECT VALUE COUNT(1) FROM c WHERE c.UserId = @userId",
            parameters: [{ name: "@userId", value: userId }]
        };

        const isAccepted = collection.queryDocuments(
            collection.getSelfLink(),
            countQuery,
            function (err, documents, responseOptions) {
                if (err) throw new Error("Error in document count query: " + err.message);

                const docCount = documents[0];
                console.log("Documents saved by current user :" + docCount + "\n");

                // Return 403 if the document count is greater than 500
                if (docCount > 500) {
                    getContext()
                        .getResponse()
                        .setBody({ StatusCode: 406, Message: "User has exceeded document limit." });
                    return;
                }

                // Step 2: Check for duplicate title
                const titleQuery = {
                    query: "SELECT VALUE COUNT(1) FROM c WHERE c.UserId = @userId AND c.Name = @title",
                    parameters: [
                        { name: "@userId", value: userId },
                        { name: "@title", value: title }
                    ]
                };

                const isAcceptedTitleCheck = collection.queryDocuments(
                    collection.getSelfLink(),
                    titleQuery,
                    function (err, titleDocuments, responseOptions) {
                        if (err)
                            throw new Error("Error in document with same title query: " + err.message);

                        const titleCount = titleDocuments[0];

                        console.log("Documents saved with this title:" + titleCount);

                        // Return 409 if the title already exists
                        if (titleCount > 0) {
                            getContext()
                                .getResponse()
                                .setBody({
                                    StatusCode: 409,
                                    Message: "Document with this title already exists."
                                });
                            return;
                        }

                        const isAcceptedCreate = collection.createDocument(
                            collection.getSelfLink(),
                            item,
                            function (err, createdDoc, responseOptions) {
                                if (err) throw new Error("Error creating document: " + err.message);

                                // Success: Document created
                                getContext().getResponse().setBody({
                                    StatusCode: 201,
                                    Message: "Document created successfully.",
                                    Document: createdDoc
                                });
                            }
                        );

                        if (!isAcceptedCreate) throw new Error("Failed to create document.");
                    }
                );

                if (!isAcceptedTitleCheck)
                    throw new Error("Failed to check title of the document.");
            }
        );

        if (!isAccepted) throw new Error("Failed to check document count for this user.");
    } catch (err) {
        response.setBody({
            status: "Error",
            message: err.message,
            stack: err.stack
        });
    }
}

function RAQ_CustomReportUpdate_V1(id, userId, title, item) {
    try {
        var context = getContext();
        var collection = context.getCollection();
        var response = context.getResponse();

        const itemSearchQuery = {
            query: "SELECT * FROM c WHERE c.UserId = @userId AND c.id = @id",
            parameters: [
                { name: "@userId", value: userId },
                { name: "@id", value: id }
            ]
        };

        const isAcceptedItemCheck = collection.queryDocuments(
            collection.getSelfLink(),
            itemSearchQuery,
            function (err, documents, responseOptions) {
                if (err) throw new Error("Error in item search query: " + err.message);

                if (documents.length < 1) {
                    getContext()
                        .getResponse()
                        .setBody({ StatusCode: 404, Message: "Document with this id not found." });
                    return;
                }

                const itemRef = documents[0];

                console.log("Item found with id: " + itemRef.id + "\n");

                // Step 1: Check for duplicate title
                const titleQuery = {
                    query: "SELECT VALUE COUNT(1) FROM c WHERE c.id != @id AND c.UserId = @userId AND c.Name = @title",
                    parameters: [
                        { name: "@id", value: id },
                        { name: "@userId", value: userId },
                        { name: "@title", value: title }
                    ]
                };

                const isAcceptedTitleCheck = collection.queryDocuments(
                    collection.getSelfLink(),
                    titleQuery,
                    function (err, titleDocuments, responseOptions) {
                        if (err) throw new Error("Error in title query: " + err.message);

                        const titleCount = titleDocuments[0];

                        console.log("Items with the same title: " + titleCount + "\n");

                        // Return 409 if the title already exists
                        if (titleCount > 0) {
                            getContext()
                                .getResponse()
                                .setBody({
                                    StatusCode: 409,
                                    Message: "Document with this title already exists."
                                });
                            return;
                        }

                        const isAcceptedCreate = collection.replaceDocument(
                            itemRef._self,
                            item,
                            function (err, createdDoc, responseOptions) {
                                if (err) throw new Error("Error replacing document: " + err.message);

                                // Success: Document created
                                getContext().getResponse().setBody({
                                    StatusCode: 201,
                                    Message: "Document replaced successfully.",
                                    Document: createdDoc
                                });
                            }
                        );

                        if (!isAcceptedCreate) throw new Error("Failed to replace document.");
                    }
                );

                if (!isAcceptedTitleCheck)
                    throw new Error("Failed to check title of the document.");
            }
        );

        if (!isAcceptedItemCheck) throw new Error("Failed to find document with id " + id);
    } catch (err) {
        response.setBody({
            status: "Error",
            message: err.message,
            stack: err.stack
        });
    }
}

function upsertDocument(dto, toDelete, toAdd) {
    var context = getContext();
    var collection = context.getCollection();
    var response = context.getResponse();
    var id = dto.id;
    var partitionKey = dto.partitionKey;
    var lastModifiedTimestamp = dto.lastModified;
    var documentLink = collection.getAltLink() + "/docs/" + id;
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
    var isAccepted = collection.readDocument(
        documentLink,
        { partitionKey: partitionKey },
        function (err, document) {
            if (err) {
                addErrorToLogs("Error reading document:", err);

                const errorObject = typeof err.message === "string" ? JSON.parse(err.message) : err;

                const hasErrors = Array.isArray(errorObject.Errors);
                const isNotFound =
                    hasErrors &&
                    errorObject.Errors.some((error) => error.includes("Resource Not Found"));
                const is404 = err.number === 404;

                if (is404 || isNotFound) {
                    makeSureDtoHasSettingDict(dto);
                    insertDocument(dto, toAdd);
                } else {
                    addErrorToLogs(
                        `Error reading document PK: ${partitionKey} and Document: ${documentLink}. Error: ${JSON.stringify(err)}`
                    );
                    getContext()
                        .getResponse()
                        .setBody({
                            StatusCode: 500,
                            ErrorMessage: `Errors : [ Error reading document PK: ${partitionKey} and Document: ${documentLink}. Error: ${JSON.stringify(err)} ]`
                        });
                    return;
                }
            } else {
                oldDocument = JSON.parse(JSON.stringify(document));
                makeSureDtoHasSettingDict(dto);
                patchDocument(document, dto, toDelete, toAdd);
            }
        }
    );
    if (!isAccepted) {
        throw new Error("Stored procedure execution failed.");
    }

    function insertDocument(newDto, toAdd) {
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
                    getContext()
                        .getResponse()
                        .setBody({
                            StatusCode: 500,
                            ErrorMessage: `Errors : [ Invalid DataVersion input ${newDto.dataVersion}]`
                        });
                    return;
                }
                newDto.dataVersion = parsedValue; // Store as a Number
            } catch (error) {
                addErrorToLogs(
                    "Invalid DataVersion value: " +
                        newDto.dataVersion +
                        " or failed to convert to js number"
                );
                getContext()
                    .getResponse()
                    .setBody({
                        StatusCode: 500,
                        ErrorMessage: `Errors : [ Invalid DataVersion input ${newDto.dataVersion}]`
                    });
                return;
            }
        }
        newDto.settings = toAdd;
        var isAccepted = collection.createDocument(
            collection.getSelfLink(),
            newDto,
            function (err, newDocument) {
                if (err) throw new Error("Error inserting document: " + err.message);
                addToLogs("inserted new document successfully...");
                response.setBody({
                    status: "Inserted",
                    statusCode: 200,
                    oldDocument: null, // No old document exists
                    newDocument: newDocument, // New document created
                    logs: logs
                });
            }
        );
        if (!isAccepted) throw new Error("Failed to insert document.");
    }

    function patchDocument(existingDocument, newDto, toDelete, toAdd) {
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
                getContext()
                    .getResponse()
                    .setBody({
                        StatusCode: 500,
                        ErrorMessage: `Errors : [ Invalid DataVersion input ${newDto.dataVersion}]`
                    });
                return;
            }
            // Ensure incoming DataVersion is not lower than existing
            if (existingDataVersion !== null && incomingDataVersion < existingDataVersion) {
                getContext()
                    .getResponse()
                    .setBody({
                        StatusCode: 409,
                        ErrorMessage: `Errors : [ Incoming DataVersion ${incomingDataVersion} must be >= existing DataVersion ${existingDataVersion} ]`
                    });
                return;
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
        var isAccepted = collection.replaceDocument(
            existingDocument._self,
            existingDocument,
            function (err, updatedDocument) {
                if (err) throw new Error("Error updating document: " + err.message);
                addToLogs("Replaced document with new document.");
                response.setBody({
                    status: "Updated",
                    statusCode: 200,
                    oldDocument: oldDocument, // Old document before the update
                    newDocument: updatedDocument, // Updated document
                    logs: logs
                });
            }
        );
        if (!isAccepted) throw new Error("Failed to update document.");
    }
}

function deleteSettingFieldFromDocument(dto, settingFieldsToDelete) {
    var context = getContext();
    var collection = context.getCollection();
    var response = context.getResponse();
    var id = dto.id;
    var partitionKey = dto.partitionKey;
    var documentLink = collection.getAltLink() + "/docs/" + id;
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
    var isAccepted = collection.readDocument(
        documentLink,
        { partitionKey: partitionKey },
        function (err, document) {
            if (err) {
                addErrorToLogs("Error reading document:", err);
                const errorObject = typeof err.message === "string" ? JSON.parse(err.message) : err;
                const hasErrors = Array.isArray(errorObject.Errors);
                const isNotFound =
                    hasErrors &&
                    errorObject.Errors.some((error) => error.includes("Resource Not Found"));
                const is404 = err.number === 404;
                if (is404 || isNotFound) {
                    addToLogs(
                        `Document not found for PK: ${partitionKey}, DocId: ${id}. Returning input document.`
                    );
                    makeSureDtoHasSettingDict(dto);
                    response.setBody({
                        StatusCode: 200,
                        status: "No changes - document did not exist",
                        oldDocument: dto,
                        newDocument: dto,
                        logs: logs
                    });
                    return;
                } else {
                    addErrorToLogs(
                        `Error reading document PK: ${partitionKey} and Document: ${documentLink}. Error: ${JSON.stringify(err)}`
                    );
                    getContext()
                        .getResponse()
                        .setBody({
                            StatusCode: 500,
                            ErrorMessage: `Errors : [ Error reading document PK: ${partitionKey} and Document: ${documentLink}. Error: ${JSON.stringify(err)} ]`
                        });
                    return;
                }
            } else {
                oldDocument = JSON.parse(JSON.stringify(document));
                makeSureDtoHasSettingDict(dto);
                deleteSettingField(document, dto, settingFieldsToDelete);
            }
        }
    );
    if (!isAccepted) {
        throw new Error("Stored procedure execution failed.");
    }
    function deleteSettingField(existingDocument, newDto, settingFieldsToDelete) {
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
                getContext()
                    .getResponse()
                    .setBody({
                        StatusCode: 404,
                        ErrorMessage: `Errors : [ No settings found for : ${missingKeys.join(", ")} ]`
                    });
                return;
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
                getContext()
                    .getResponse()
                    .setBody({
                        StatusCode: 500,
                        ErrorMessage: `Errors : [ Invalid DataVersion input ${newDto.dataVersion}]`
                    });
                return;
            }
            // Ensure incoming DataVersion is not lower than existing
            if (existingDataVersion !== null && incomingDataVersion < existingDataVersion) {
                addErrorToLogs("Incoming DataVersion must be >= existing DataVersion.");
                getContext()
                    .getResponse()
                    .setBody({
                        StatusCode: 409,
                        ErrorMessage: `Errors : [ Incoming DataVersion ${incomingDataVersion} must be >= existing DataVersion ${existingDataVersion} ]`
                    });
                return;
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
        var isAccepted = collection.replaceDocument(
            existingDocument._self,
            existingDocument,
            function (err, updatedDocument) {
                if (err) throw new Error("Error updating document: " + err.message);
                addToLogs("Replaced document with new document.");
                response.setBody({
                    status: "Updated",
                    StatusCode: 200,
                    oldDocument: oldDocument, // Old document before the update
                    newDocument: updatedDocument, // Updated document
                    logs: logs
                });
            }
        );
        if (!isAccepted) throw new Error("Failed to update document.");
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
