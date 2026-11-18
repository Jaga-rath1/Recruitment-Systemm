function parsePagination(query = {}) {
  const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit, 10) || 20));
  const cursor = typeof query.cursor === 'string' && query.cursor.trim() ? query.cursor.trim() : null;
  const skip = cursor ? 0 : (page - 1) * limit;

  return { page, limit, cursor, skip };
}

function buildPaginationMeta({ items, limit, total = undefined, page = 1, cursor = null }) {
  const hasMore = items.length > limit;
  const sliced = hasMore ? items.slice(0, limit) : items;
  const nextCursor = hasMore && sliced.length > 0 ? sliced[sliced.length - 1].id : null;

  const meta = {
    limit,
    page: cursor ? undefined : page,
    hasMore,
    nextCursor
  };

  if (typeof total === 'number') {
    meta.total = total;
    meta.totalPages = Math.ceil(total / limit);
  }

  return { items: sliced, meta };
}

module.exports = {
  parsePagination,
  buildPaginationMeta
};

