function getUtcDate(dateString) {
  return new Date(`${dateString}T00:00:00.000Z`);
}

function buildDateFilter({ date, month, year }) {
  if (date) {
    return {
      equals: getUtcDate(date)
    };
  }

  if (month && year) {
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = month === 12 ? new Date(Date.UTC(year + 1, 0, 1)) : new Date(Date.UTC(year, month, 1));
    return {
      gte: start,
      lt: end
    };
  }

  if (year) {
    return {
      gte: new Date(Date.UTC(year, 0, 1)),
      lt: new Date(Date.UTC(year + 1, 0, 1))
    };
  }

  return undefined;
}

module.exports = {
  buildDateFilter
};
