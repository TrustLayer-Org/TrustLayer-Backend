// Business directory derived from stored trust signals.

// Return the distinct business ids referenced by a collection of signals.
const listBusinessIds = (signals) => {
  const ids = [];
  signals.forEach((signal) => {
    if (!ids.includes(signal.businessId)) {
      ids.push(signal.businessId);
    }
  });
  return ids;
};

module.exports.listBusinessIds = listBusinessIds;
