const { ValidationError } = require('../utils/AppError');
const { containsUnsafeKeys } = require('../utils/validationHelpers');

function validate(schemas = {}) {
  return (req, _res, next) => {
    try {
      const issues = [];

      if (containsUnsafeKeys(req.body)) {
        return next(
          new ValidationError('Request contains forbidden object property keys', [
            { location: 'body', path: '', message: 'Forbidden object property key detected' }
          ])
        );
      }

      if (schemas.params) {
        const parsed = schemas.params.safeParse(req.params);
        if (!parsed.success) {
          issues.push(...parsed.error.issues.map((i) => ({ location: 'params', path: i.path.join('.'), message: i.message })));
        } else {
          req.params = parsed.data;
        }
      }

      if (schemas.query) {
        const parsed = schemas.query.safeParse(req.query);
        if (!parsed.success) {
          issues.push(...parsed.error.issues.map((i) => ({ location: 'query', path: i.path.join('.'), message: i.message })));
        } else {
          req.query = parsed.data;
        }
      }

      if (schemas.body) {
        const parsed = schemas.body.safeParse(req.body);
        if (!parsed.success) {
          issues.push(...parsed.error.issues.map((i) => ({ location: 'body', path: i.path.join('.'), message: i.message })));
        } else {
          req.body = parsed.data;
        }
      }

      if (issues.length > 0) {
        return next(new ValidationError('Request validation failed', issues));
      }

      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = validate;

