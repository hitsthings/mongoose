/**
 * Module dependencies.
 */

var SchemaType = require('../schematype')
  , CastError = SchemaType.CastError
  , NumberSchema = require('./number')
  , Types = {
        Boolean: require('./boolean')
      , Date: require('./date')
      , Number: require('./number')
      , String: require('./string')
      , ObjectId: require('./objectid')
      , Buffer: require('./buffer')
    }
  , MongooseArray = require('../types').Array
  , Mixed = require('./mixed')
  , Query = require('../query')
  , isMongooseObject = require('../utils').isMongooseObject

/**
 * Array SchemaType constructor
 *
 * @param {String} key
 * @param {SchemaType} cast
 * @api private
 */

function SchemaArray (key, cast, options) {
  if (cast) {
    var castOptions = {};

    if ('Object' === cast.constructor.name) {
      if (cast.type) {
        // support { type: Woot }
        castOptions = cast;
        cast = cast.type;
        delete castOptions.type;
      } else {
        cast = Mixed;
      }
    }

    var caster = cast.name in Types ? Types[cast.name] : cast;
    this.casterConstructor = caster;
    this.caster = new caster(null, castOptions);
  }

  SchemaType.call(this, key, options);

  var self = this
    , defaultArr
    , fn;

  if (this.defaultValue) {
    defaultArr = this.defaultValue;
    fn = 'function' == typeof defaultArr;
  }

  this.default(function(){
    var arr = fn ? defaultArr() : defaultArr || [];
    return new MongooseArray(arr, self.path, this);
  });
};

/**
 * Inherits from SchemaType.
 */

SchemaArray.prototype.__proto__ = SchemaType.prototype;

/**
 * Check required
 *
 * @api private
 */

SchemaArray.prototype.checkRequired = function (value) {
  return !!(value && value.length);
};

/**
 * Overrides the getters application for the population special-case
 * TODO: implement this in SchemaObjectIdArray
 *
 * @param {Object} value
 * @param {Object} scope
 * @api private
 */

SchemaArray.prototype.applyGetters = function (value, scope) {
  if (this.caster.options && this.caster.options.ref) {
    // means the object id was populated
    return value;
  }

  return SchemaType.prototype.applyGetters.call(this, value, scope);
};

/**
 * Casts contents
 *
 * @param {Object} value
 * @param {Document} document that triggers the casting
 * @param {Boolean} whether this is an initialization cast
 * @api private
 */

SchemaArray.prototype.cast = function (value, doc, init) {
  if (Array.isArray(value)) {
    if (!(value instanceof MongooseArray)) {
      value = new MongooseArray(value, this.path, doc);
    }

    if (this.caster) {
      try {
        for (var i = 0, l = value.length; i < l; i++) {
          value[i] = this.caster.cast(value[i], doc, init);
        }
      } catch (e) {
        // rethrow
        throw new CastError(e.type, value);
      }
    }

    return value;
  } else {
    return this.cast([value], doc, init);
  }
};

SchemaArray.prototype.castForQuery = function ($conditional, value) {
  var handler
    , val;
  if (arguments.length === 2) {
    handler = this.$conditionalHandlers[$conditional];
    if (!handler)
      throw new Error("Can't use " + $conditional + " with Array.");
    val = handler.call(this, value);
  } else {
    val = $conditional;
    var proto = this.casterConstructor.prototype;
    var method = proto.castForQuery || proto.cast;
    if (Array.isArray(val)) {
      val = val.map(function (v) {
        if (method) v = method.call(proto, v);
        return isMongooseObject(v)
          ? v.toObject()
          : v;
      });
    } else if (method) {
      val = method.call(proto, val);
    }
  }
  return val && isMongooseObject(val)
    ? val.toObject()
    : val;
};

/**
 * @ignore
 */

function castToNumber (val) {
  return Types.Number.prototype.cast.call(this, val);
}

SchemaArray.prototype.$conditionalHandlers = {
    '$all': function handle$all (val) {
      if (!Array.isArray(val)) {
        val = [val];
      }

      val = val.map(function (v) {
        if (v && 'Object' === v.constructor.name) {
          var o = {};
          o[this.path] = v;
          var query = new Query(o);
          query.cast(this.casterConstructor);
          return query._conditions[this.path];
        }
        return v;
      }, this);

      return this.castForQuery(val);
    }
  , '$elemMatch': function (val) {
      var query = new Query(val);
      query.cast(this.casterConstructor);
      return query._conditions;
    }
  , '$size': castToNumber
  , '$ne': SchemaArray.prototype.castForQuery
  , '$in': SchemaArray.prototype.castForQuery
  , '$nin': SchemaArray.prototype.castForQuery
  , '$regex': SchemaArray.prototype.castForQuery
  , '$near': SchemaArray.prototype.castForQuery
  , '$nearSphere': SchemaArray.prototype.castForQuery
  , '$gt': castToNumber
  , '$gte': castToNumber
  , '$lt': castToNumber
  , '$lte': castToNumber
  , '$within': function(val) {
      var query = new Query(val);
      query.cast(this.casterConstructor)
      return query._conditions;
    }
  , '$maxDistance': castToNumber
};

/**
 * Module exports.
 */

module.exports = SchemaArray;
