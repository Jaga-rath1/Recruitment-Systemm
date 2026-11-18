function toPlain(instance) {
  if (!instance) return null;
  if (typeof instance.get === 'function') {
    return instance.get({ plain: true });
  }
  return instance;
}

function toPlainList(instances = []) {
  return (instances || []).map(toPlain);
}

module.exports = {
  toPlain,
  toPlainList
};

