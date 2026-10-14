// mongosh executes this file; output is kept only in the drill's private temporary directory.
// eslint-disable-next-line no-undef
const database = db.getSiblingDB('novu');
const snapshot = {};
for (const name of database.getCollectionNames().sort()) {
  const collection = database.getCollection(name);
  snapshot[name] = {
    documents: collection.find().sort({ _id: 1 }).toArray(),
    indexes: collection.getIndexes().sort((a, b) => a.name.localeCompare(b.name)),
  };
}
// eslint-disable-next-line no-undef
print(EJSON.stringify(snapshot, { relaxed: false }));
