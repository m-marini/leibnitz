import * as Lexer from 'flex-js';
import { default as _ } from 'lodash';
import { OpTreeBuilder } from './tensor-0.1.2';

const NumberToken = 'Number';
const IdToken = 'Identifier';
const SymbolToken = 'Symbol';

function createMissingReferenceResult(id) {
    return new CodeResult(FieldType, 0, 0, [OpTreeBuilder.createField(ZeroValue)], ['Unresolved reference ' + id]);
}

class Builder {
    constructor(conf) {
        this._conf = conf;
    }

    build() {
        this._defs = {
            vars: {},
            funcs: {}
        };
        _.each(this._conf.funcs, (data, ref) => {
            this.buildRef(ref);
        });
        _.each(this._conf.vars, (data, ref) => {
            this.buildRef(ref);
        });

        _.each(this._conf.funcs, (data, ref) => {
            const defs = this._defs.funcs[ref];
            data.errors = defs ? _.concat(data.errors, defs.errors) : data.errors;
            data.result = defs;
        });
        _.each(this._conf.vars, (data, ref) => {
            const defs = this._defs.vars[ref];
            data.errors = defs ? _.concat(data.errors, defs.errors) : data.errors;
            data.result = defs;
        });
        _.each(this._conf.update, (data, ref) => {
            const defs = this.buildExp(data.node);
            data.errors = defs ? _.concat(data.errors, defs.errors) : data.errors;
            data.result = defs;
        });
        _.each(this._conf.bodies, (data, ref) => {
            const defs = this.buildExp(data.position.node);
            data.position.errors = defs ? _.concat(data.position.errors, defs.errors) : data.position.errors;
            data.position.result = defs;
            if (data.rotation) {
                const defs = this.buildExp(data.rotation.node);
                data.rotation.errors = defs ? _.concat(data.rotation.errors, defs.errors) : data.rotation.errors;
                data.rotation.result = defs;
            }
        });
        return this._conf;
    }

    buildRef(ref) {
        // Check if already validated
        const def = this._defs.funcs[ref] || this._defs.vars[ref];
        if (def) {
            return def;
        }
        const varDef = this._conf.vars[ref];
        const funcDef = this._conf.funcs[ref];
        if (funcDef) {
            this._defs.funcs[ref] = CircularResferenceResult;
            this._defs.funcs[ref] = this.buildExp(funcDef.node);
            return this._defs.funcs[ref];
        } else if (varDef) {
            this._defs.vars[ref] = CircularResferenceResult;
            this._defs.vars[ref] = this.buildExp(varDef.node);
            return this._defs.vars[ref];
        } else {
            return createMissingReferenceResult(ref);
        }
    }

    buildExp(node) {
        return node.build(this);
    }
}

class System {
    constructor(vars, funcs, update, bodies) {
        this._vars = vars;
        this._funcs = funcs;
        this._update = update;
        this._bodies = bodies;
    }

    next(dt) {
        this._funcs.dt = OpTreeBuilder.createField([0, 0, 0, dt]);
        const vars = _.mapValues(this._vars, (value, ref) => {
            const update = this._update[ref];
            return update ? update.apply(this) : value;
        });
        return new System(vars, this._funcs, this._update, this._bodies);
    }

    resolve(id) {
        const funcCode = this._funcs[id];
        if (funcCode) {
            return funcCode.apply(this);
        }
        return this._vars[id];
    }

    get bodies() {
        return _.map(this._bodies, data => {
            const result = {
                position: data.position.apply(this)
            };
            if (data.rotation) {
                result.rotation = data.rotation.apply(this);
            }
            return result;
        });
    }
}

class SystemParser {

    constructor(config) {
        this._config = config;
        this._parserAst = new ParserAst();
    }

    /* Returns the error report and the initial state of simulated system */
    parse() {
        const conf1 = this.parseAll();
        const conf2 = this.checkForFunctionsRedefinition(conf1);
        const conf3 = this.checkForUpdateDefinition(conf2);
        const conf4 = this.build(conf3);
        const conf5 = this.checkForUpdateTypeDefinition(conf4);
        const conf = this.checkForBodiesTypeDefinition(conf5);

        const errors = this.createErrors(conf);
        const system = this.errorCount(conf) === 0 ? this.buildSystem(conf) : undefined;
        return {
            parserState: conf,
            errors: errors,
            system: system
        };
    }

    /* Returns the AST all all definition by parseing all config definitions */
    parseAll() {
        const vars = _.mapValues(this._config.vars, exp => {
            const node = this._parserAst.parse(exp);
            return {
                exp: exp,
                errors: this._parserAst.errors,
                node: node
            }
        });
        const funcs = _.mapValues(this._config.funcs, exp => {
            const node = this._parserAst.parse(exp);
            return {
                exp: exp,
                errors: this._parserAst.errors,
                node: node
            }
        });
        const bodies = _.map(this._config.bodies, c => {
            const positionNode = this._parserAst.parse(c.position);
            const positionErrors = this._parserAst.errors;
            const result = {
                position: {
                    exp: c.position,
                    errors: positionErrors,
                    node: positionNode
                }
            };
            if (c.rotation) {
                const node = this._parserAst.parse(c.rotation);
                const errors = this._parserAst.errors;
                result.rotation = {
                    exp: c.rotation,
                    errors: errors,
                    node: node
                }
            }
            return result;
        });
        const update = _.mapValues(this._config.update, exp => {
            const node = this._parserAst.parse(exp);
            return {
                exp: exp,
                errors: this._parserAst.errors,
                node: node
            }
        });
        this._result = {
            vars: vars,
            funcs: funcs,
            bodies: bodies,
            update: update
        };
        return this._result;
    }

    /* Returns the number of errors of the parser state */
    errorCount(conf) {
        return _(conf.vars).map(data => data.errors.length).sum()
            + _(conf.funcs).map(data => data.errors.length).sum()
            + _(conf.update).map(data => data.errors.length).sum()
            + _(conf.bodies).map(data => data.position.errors.length
                + (data.rotation ? data.rotation.errors.length : 0)).sum();
    }

    /* Returns the parser state after checking the correct match between
     * between update and variable types
     */
    checkForBodiesTypeDefinition(conf) {
        _.each(conf.bodies, data => {
            const posResult = data.position.result;
            if (!(posResult.type === VectorType)) {
                data.position.errors.push('Position must be a vector');
            }
            if (data.rotation) {
                const rotType = data.rotation.result;
                if (!(rotType.type === FieldType)) {
                    data.rotation.errors.push('Rotation must be a quaternion');
                }
            }
        });
        return conf;
    }

    /* Returns the error report from a parser state */
    createErrors(conf5) {
        return {
            funcs: _.mapValues(conf5.funcs, 'errors'),
            vars: _.mapValues(conf5.vars, 'errors'),
            update: _.mapValues(conf5.update, 'errors'),
            bodies: _.map(conf5.bodies, body => {
                const result = {
                    position: body.position.errors
                };
                if (body.rotation) {
                    result.rotation = body.rotation.errors;
                }
                return result;
            })
        };
    }

    /* Returns the initial state of simulated system from the parser state */
    buildSystem(conf) {
        const funcsCode = _.mapValues(conf.funcs, data => data.result.code);
        const varsCode = _.mapValues(conf.vars, data => data.result.code);
        const resolver = {
            resolve: id =>
                funcsCode[id] ? funcsCode[id].apply(resolver) : varsCode[id].apply(resolver)
        }
        const vars = _.mapValues(conf.vars, data => data.result.code.apply(resolver));

        const updateCode = _.mapValues(conf.update, data => data.result.code);
        const bodiesCode = _.map(conf.bodies, data => {
            const posCode = data.position.result.code;
            const posCode1 = data.position.result.rows !== 3 ? OpTreeBuilder.createResizeVector(posCode, 3) : posCode;
            const result = {
                position: posCode1
            }
            if (data.rotation) {
                result.rotation = data.rotation.result.code
            }
            return result;
        });
        return new System(vars, funcsCode, updateCode, bodiesCode);
    }

    /* Returns the parser state with the operation tree of configuration */
    build(conf) {
        return new Builder(conf).build();
    }

    /* Returns the parser state after checking the correct match
     * between update and variable definitions
     */
    checkForUpdateDefinition(conf) {

        function isVar(ref) {
            return conf.vars[ref] !== undefined;
        }

        _(conf.update).each((data, ref) => {
            if (!isVar(ref)) {
                data.errors.push('Update ' + ref + ' is not a variable')
            }
        });
        return conf;
    }

    /* Returns the parser state after checking the absence of override
     * between function and variable definitions
     */
    checkForFunctionsRedefinition(conf) {

        function isFunction(ref) {
            return ref === 'dt' || conf.funcs[ref] !== undefined;
        }

        _(conf.vars).each((data, ref) => {
            if (isFunction(ref)) {
                data.errors.push('Function ' + ref + ' cannot be redefined as variable')
            }
        });

        return conf;
    }

    /* Returns the parser state after checking the correct match between
     * between update and variable types
     */
    checkForUpdateTypeDefinition(conf) {
        _.each(conf.update, (data, ref) => {
            const varResult = conf.vars[ref] && conf.vars[ref].result;
            if (varResult) {
                const upResult = data.result;
                const sameSize = varResult.type === upResult.type && (
                    varResult.type === FieldType
                    || varResult.type === VectorType && varResult.rows === upResult.rows
                    || varResult.type === MatrixType
                    && varResult.rows === upResult.rows
                    && varResult.rows === upResult.rows);
                if (!sameSize) {
                    data.errors.push('Update type must be equal var type');
                }
            }
        });
        return conf;
    }
}

const FieldType = "Field";
const VectorType = "Vector";
const MatrixType = "Matrix";

class CodeResult {
    constructor(type, rows, cols, code, errors) {
        this._type = type;
        this._rows = rows || 0;
        this._cols = cols || 0;
        this._code = code || [];
        this._errors = errors || [];
    }

    get code() { return this._code; }
    get rows() { return this._rows; }
    get cols() { return this._cols; }
    get type() { return this._type; }
    get errors() { return this._errors; }

    withType(type) { return new CodeResult(type, this.rows, this.cols, this.code, this.errors); }
    withRows(rows) { return new CodeResult(this.type, rows, this.cols, this.code, this.errors); }
    withCols(cols) { return new CodeResult(this.type, this.rows, cols, this.code, this.errors); }
    withSize(rows, cols) { return new CodeResult(this.type, rows, cols, this.code, this.errors); }
    withCode(code) {
        return new CodeResult(this.type, this.rows, this.cols, code, this.errors);
    }
    withErrors(errors) {
        return new CodeResult(this.type, this.rows, this.cols, this.code, errors);
    }
    withMoreErrors() {
        return this.withErrors(_.flatten(_.concat(this._errors, arguments)));
    }
    withTypeOf(other) {
        return new CodeResult(other.type, other.rows, other.cols, this.code, this.errors);
    }
}

const ZeroValue = [0, 0, 0, 0];
const OneValue = [0, 0, 0, 1];

const CircularResferenceResult = new CodeResult(FieldType, 0, 0, [OpTreeBuilder.createField(ZeroValue)], ["Circular reference"]);

class ASTNode {
    get dependencies() { return []; }
    // Returns the type of result and related errors
    validate(context) { throw new Error('Not implemented'); }
    // Returns the type of result, the generated code and errors
    build() { throw new Error('Not implemented'); }
}

class ConstantNode extends ASTNode {
    constructor(value) {
        super();
        this._value = Array.isArray(value) ? value : [0, 0, 0, value];
    }
    get value() { return this._value; }
    build(context) { return new CodeResult(FieldType, 0, 0, OpTreeBuilder.createField(this.value)); }
}

class BaseNode extends ASTNode {
    constructor(size) {
        super();
        this._size = size;
    }
    get size() { return this._size; }
    build(builder) {
        const value = _.map(_.range(this.size + 1), i => i === this.size ? OneValue : ZeroValue);
        return new CodeResult(VectorType, this.size + 1, 0, OpTreeBuilder.createVector(value));
    }

}

class IdentityNode extends ASTNode {
    constructor(size) {
        super();
        this._size = size;
    }
    get size() { return this._size; }
    build(builder) {
        const value = _.map(_.range(this.size), i =>
            _.map(_.range(this.size), j =>
                i === j ? OneValue : ZeroValue
            ));
        return new CodeResult(MatrixType, this.size, this.size, OpTreeBuilder.createMatrix(value));
    }
}

class RefNode extends ASTNode {
    constructor(id) {
        super();
        this._id = id;

    }
    get dependencies() { return [this.id]; }
    get id() { return this._id; }

    build(builder) {
        return builder.buildRef(this.id).withCode(OpTreeBuilder.createRef(this.id));
    }
}

class DtRefNode extends ASTNode {
    constructor(id) {
        super();
        this._id = id;

    }

    build(builder) {
        return new CodeResult(FieldType, 0, 0, OpTreeBuilder.createRef('dt'));
    }
}

class UnaryNode extends ASTNode {
    constructor(arg) {
        super();
        this._arg = arg;
    }

    get dependencies() { return this.arg.dependencies; }

    get arg() { return this._arg; }
}

class NegNode extends UnaryNode {
    build(builder) {
        const op = this.arg.build(builder)
        switch (op.type) {
            case FieldType:
                return op.withCode(OpTreeBuilder.createNegateField(op.code));
            case VectorType:
                return op.withCode(OpTreeBuilder.createNegateVector(op.code));
            default:
                return op.withCode(OpTreeBuilder.createNegateMatrix(op.code));

        }
    }
}

class ModNode extends UnaryNode {
    build(context) {
        const op = this.arg.build(context);
        switch (op.type) {
            case FieldType:
                return op;
            case VectorType:
                return op.withType(FieldType).withCode(OpTreeBuilder.createVectorModule(op.code));
            default:
                return op.withMoreErrors(['Invalid module operation on matrix']);
        }
    }
}

class TransposeNode extends UnaryNode {
    build(context) {
        const op = this.arg.build(context);
        switch (op.type) {
            case FieldType:
                return op.withMoreErrors(['Invalid transpose operation on value']);
            case VectorType:
                return op.withMoreErrors(['Invalid transpose operation on vector']);
            default:
                return op.withSize(op.cols, op.rows).withCode(OpTreeBuilder.createTransposeMatrix(op.code));
        }
    }
}

class SqrtNode extends UnaryNode {
}

class ExpNode extends UnaryNode {
    build(context) {
        const op = this.arg.build(context);
        switch (op.type) {
            case FieldType:
                return op.withCode(OpTreeBuilder.createExp(op.code));
            case VectorType:
                return op.withMoreErrors(['Invalid exp operation on vector']);
            default:
                return op.withMoreErrors(['Invalid exp operation on matrix']);
        }
    }
}

class SinNode extends UnaryNode {

    build(context) {
        const op = this.arg.build(context);
        switch (op.type) {
            case FieldType:
                return op.withCode(OpTreeBuilder.createSin(op.code));
            case VectorType:
                return op.withMoreErrors(['Invalid sin operation on vector']);
            default:
                return op.withMoreErrors(['Invalid sin operation on matrix']);
        }
    }
}

class CosNode extends UnaryNode {
    build(context) {
        const op = this.arg.build(context);
        switch (op.type) {
            case FieldType:
                return op.withCode(OpTreeBuilder.createCos(op.code));
            case VectorType:
                return op.withMoreErrors(['Invalid cos operation on vector']);
            default:
                return op.withMoreErrors(['Invalid cos operation on matrix']);
        }
    }
}
class TanNode extends UnaryNode {
}

class AsinNode extends UnaryNode {
}

class AcosNode extends UnaryNode {
}

class AtanNode extends UnaryNode {
}

class SinhNode extends UnaryNode {
}

class CoshNode extends UnaryNode {
}

class TanhNode extends UnaryNode {
}

class LogNode extends UnaryNode {
}

class QrotNode extends UnaryNode {
    build(context) {
        const op = this.arg.build(context);
        switch (op.type) {
            case FieldType:
                return op.withMoreErrors(['Invalid qrot operation on value']);
            case VectorType:
                const c1 = (op.rows !== 3) ? OpTreeBuilder.createResizeVector(op.code, 3) : op.code;
                return op.withType(FieldType).withCode(OpTreeBuilder.createQrot(c1));
            default:
                return op.withMoreErrors(['Invalid qrot operation on matrix']);
        }
    }
}

class BinaryNode extends ASTNode {
    constructor(arg1, arg2) {
        super();
        this._arg1 = arg1;
        this._arg2 = arg2;
    }

    get dependencies() {
        return _.concat(
            this.arg1.dependencies,
            this.arg2.dependencies);
    }

    get arg1() { return this._arg1; }
    get arg2() { return this._arg2; }
}

class PwrNode extends BinaryNode {
    build(context) {
        const op1 = this.arg1.build(context);
        const op2 = this.arg2.build(context);

        switch (op1.type) {
            case FieldType:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createPower(op1.code, op2.code));
                    case VectorType:
                        return op1.withMoreErrors(op2.errors, ['Invalid power Value and Vector']);
                    default:
                        return op1.withMoreErrors(op2.errors, ['Invalid power Value and Matrix']);
                }
            case VectorType:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors, ['Invalid power vector and value']);
                    case VectorType:
                        return op1.withMoreErrors(op2.errors, ['Invalid power vector and vector']);
                    default:
                        return op1.withMoreErrors(op2.errors, ['Invalid power vector and matrix']);
                }
            default:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors, ['Invalid power matrix and value']);
                    case VectorType:
                        return op1.withMoreErrors(op2.errors, ['Invalid power matrix and vector']);
                    default:
                        return op1.withMoreErrors(op2.errors, ['Invalid power matrix and matrix']);
                }
        }
    }
}

class CatNode extends BinaryNode {

    build(context) {
        const op1 = this.arg1.build(context);
        const op2 = this.arg2.build(context);

        switch (op1.type) {
            case FieldType:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors).withType(VectorType)
                            .withRows(2).withCode(OpTreeBuilder.createCatField(op1.code, op2.code));
                    case VectorType:
                        return op1.withMoreErrors(op2.errors).withType(VectorType)
                            .withRows(op2.rows + 1).withCode(OpTreeBuilder.createInsertFieldAt(op2.code, op1.code, 0));
                    default:
                        return op1.withMoreErrors(op2.errors, ['Invalid append Value and Matrix']);
                }
            case VectorType:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors).withRows(op1.rows + 1)
                            .withCode(OpTreeBuilder.createInsertFieldAt(op1.code, op2.code, op1.rows));
                    case VectorType: {
                        //Resize
                        const c1 = op1.rows < op2.rows ? OpTreeBuilder.createResizeVector(op1.code, op2.rows) : op1.code;
                        const c2 = op1.rows > op2.rows ? OpTreeBuilder.createResizeVector(op2.code, op1.rows) : op2.code;
                        return op1.withMoreErrors(op2.errors).withType(MatrixType)
                            .withSize(Math.max(op1.rows, op2.rows), 2).withCode(OpTreeBuilder.createCatVector(c1, c2));
                    }
                    default: {
                        //Resize
                        const c1 = op1.rows < op2.rows ? OpTreeBuilder.createResizeVector(op1.code, op2.rows) : op1.code;
                        const c2 = op1.rows > op2.rows ? OpTreeBuilder.createResizeMatrix(op2.code, op1.rows, op2.cols) : op2.code;
                        return op1.withMoreErrors(op2.errors).withType(MatrixType)
                            .withSize(Math.max(op1.rows, op2.rows), op1.cols + 1).withCode(OpTreeBuilder.createInsertVector(c2, c1));
                    }
                }
            default:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors, ['Invalid append matrix and value']);
                    case VectorType: {
                        //Resize
                        const c1 = op1.rows < op2.rows ? OpTreeBuilder.createResizeMatrix(op1.code, op2.rows, op1.cols) : op1.code;
                        const c2 = op1.rows > op2.rows ? OpTreeBuilder.createResizeVector(op2.code, op1.rows, op2.cols) : op2.code;
                        return op1.withMoreErrors(op2.errors).withType(MatrixType)
                            .withSize(Math.max(op1.rows, op2.rows), op1.cols + 1).withCode(OpTreeBuilder.createAppendVector(c1, c2));
                    }
                    default: {
                        //Resize
                        const c1 = op1.rows < op2.rows ? OpTreeBuilder.createResizeMatrix(op1.code, op2.rows, op1.cols) : op1.code;
                        const c2 = op1.rows > op2.rows ? OpTreeBuilder.createResizeMatrix(op2.code, op1.rows, op2.cols) : op2.code;
                        return op1.withMoreErrors(op2.errors).withType(MatrixType)
                            .withSize(Math.max(op1.rows, op2.rows), op1.cols + op2.cols).withCode(OpTreeBuilder.createAppendMatrix(c1, c2));
                    }
                }
        }
    }
}

class AddNode extends BinaryNode {

    build(context) {
        const op1 = this.arg1.build(context);
        const op2 = this.arg2.build(context);

        switch (op1.type) {
            case FieldType:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createSumField(op1.code, op2.code));
                    case VectorType:
                        return op1.withMoreErrors(op2.errors, ['Invalid sum Value and Vector']);
                    default:
                        return op1.withMoreErrors(op2.errors, ['Invalid sum Value and Matrix']);
                }
            case VectorType:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors, ['Invalid sum Vector and Value']);
                    case VectorType: {
                        //Resize
                        const c1 = op1.rows < op2.rows ? OpTreeBuilder.createResizeVector(op1.code, op2.rows) : op1.code;
                        const c2 = op1.rows > op2.rows ? OpTreeBuilder.createResizeVector(op2.code, op1.rows) : op2.code;
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createSumVector(c1, c2));
                    }
                    default:
                        return op1.withMoreErrors(op2.errors, ['Invalid sum Vector and Matrix']);
                }
            default:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors, ['Invalid sum Matrix and Value']);
                    case VectorType:
                        return op1.withMoreErrors(op2.errors, ['Invalid sum Matrix and Vector']);
                    default: {
                        // Resize
                        const c1 = (op1.rows < op2.rows || op1.cols < op2.cols)
                            ? OpTreeBuilder.createResizeMatrix(op1.code,
                                Math.max(op1.rows, op2.rows),
                                Math.max(op1.cols, op2.cols))
                            : op1.code;
                        const c2 = (op1.rows > op2.rows || op1.cols > op2.cols)
                            ? OpTreeBuilder.createResizeMatrix(op2.code,
                                Math.max(op1.rows, op2.rows),
                                Math.max(op1.cols, op2.cols))
                            : op2.code;
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createSumMatrix(c1, c2));
                    }
                }
        }
    }
}

class SubNode extends BinaryNode {

    build(context) {
        const op1 = this.arg1.build(context);
        const op2 = this.arg2.build(context);
        switch (op1.type) {
            case FieldType:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createSubField(op1.code, op2.code));
                    case VectorType:
                        return op1.withMoreErrors(op2.errors, ['Invalid sub Value and Vector']);
                    default:
                        return op1.withMoreErrors(op2.errors, ['Invalid sub Value and Matrix']);
                }
            case VectorType:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors, ['Invalid sub Vector and Value']);
                    case VectorType: {
                        //Resize
                        const c1 = op1.rows < op2.rows ? OpTreeBuilder.createResizeVector(op1.code, op2.rows) : op1.code;
                        const c2 = op1.rows > op2.rows ? OpTreeBuilder.createResizeVector(op2.code, op1.rows) : op2.code;
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createSubVector(c1, c2));
                    }
                    default:
                        return op1.withMoreErrors(op2.errors, ['Invalid sub Vector and Matrix']);
                }
            default:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors, ['Invalid sub Matrix and Value']);
                    case VectorType:
                        return op1.withMoreErrors(op2.errors, ['Invalid sub Matrix and Vector']);
                    default: {
                        // Resize
                        const c1 = (op1.rows < op2.rows || op1.cols < op2.cols)
                            ? OpTreeBuilder.createResizeMatrix(op1.code,
                                Math.max(op1.rows, op2.rows),
                                Math.max(op1.cols, op2.cols))
                            : op1.code;
                        const c2 = (op1.rows > op2.rows || op1.cols > op2.cols)
                            ? OpTreeBuilder.createResizeMatrix(op2.code,
                                Math.max(op1.rows, op2.rows),
                                Math.max(op1.cols, op2.cols))
                            : op2.code;
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createSubMatrix(c1, c2));
                    }
                }
        }
    }
}

class MulNode extends BinaryNode {

    build(context) {
        const op1 = this.arg1.build(context);
        const op2 = this.arg2.build(context);

        switch (op1.type) {
            case FieldType:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createProduct(op1.code, op2.code));
                    case VectorType:
                        return op1.withTypeOf(op2).withMoreErrors(op2.errors).withCode(OpTreeBuilder.createScaleVector(op2.code, op1.code));
                    default:
                        return op1.withTypeOf(op2).withMoreErrors(op2.errors).withCode(OpTreeBuilder.createScaleMatrix(op2.code, op1.code));
                }
            case VectorType:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createScaleVector(op1.code, op2.code));
                    case VectorType: {
                        const c1 = op1.rows > op2.rows ? OpTreeBuilder.createResizeVector(op1.code, op2.rows) : op1.code;
                        const c2 = op1.rows < op2.rows ? OpTreeBuilder.createResizeVector(op2.code, op1.rows) : op2.code;
                        return op1.withType(FieldType).withMoreErrors(op2.errors).withCode(OpTreeBuilder.createScalarProduct(c1, c2));
                    }
                    default:
                        return op1.withMoreErrors(op2.errors, ['Invalid multiplication Vector by Matrix']);
                }
            default:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createScaleMatrix(op1.code, op2.code));
                    case VectorType: {
                        const c1 = op1.cols > op2.rows ? OpTreeBuilder.createResizeMatrix(op1.code, op1.rows, op2.rows) : op1.code;
                        const c2 = op1.cols < op2.rows ? OpTreeBuilder.createResizeVector(op2.code, op1.cols) : op2.code;
                        return op1.withTypeOf(VectorType)
                            .withRows(op1.rows).withMoreErrors(op2.errors)
                            .withCode(OpTreeBuilder.createMatrixVectorProduct(c1, c2));
                    }
                    default: {
                        const c1 = op1.cols > op2.rows ? OpTreeBuilder.createResizeMatrix(op1.code, op1.rows, op2.rows) : op1.code;
                        const c2 = op1.cols < op2.rows ? OpTreeBuilder.createResizeMatrix(op2.code, op1.cols, op2.cols) : op2.code;
                        return op1.withSize(op1.rows, op2.cols).withMoreErrors(op2.errors).withCode(OpTreeBuilder.createMatrixProduct(c1, c2));
                    }
                }
        }
    }
}

class DivNode extends BinaryNode {

    build(context) {
        const op1 = this.arg1.build(context);
        const op2 = this.arg2.build(context);

        switch (op1.type) {
            case FieldType:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createDivideField(op1.code, op2.code));
                    case VectorType:
                        return op1.withMoreErrors(op2.errors, ['Invalid division field by vector']);
                    default:
                        return op1.withMoreErrors(op2.errors, ['Invalid division field by matrix']);
                }
            case VectorType:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createDivideVector(op1.code, op2.code));
                    case VectorType:
                        return op1.withMoreErrors(op2.errors, ['Invalid division vector by vector']);
                    default:
                        return op1.withMoreErrors(op2.errors, ['Invalid division vector by matrix']);
                }
            default:
                switch (op2.type) {
                    case FieldType:
                        return op1.withMoreErrors(op2.errors).withCode(OpTreeBuilder.createDivideMatrix(op1.code, op2.code));
                    case VectorType:
                        return op1.withMoreErrors(op2.errors, ['Invalid division matrix by vector']);
                    default:
                        return op1.withMoreErrors(op2.errors, ['Invalid division matrix by matrix']);
                }
        }
    }
}

const DefaultNode = new ConstantNode('0');

const UnaryFunctions = {
    sin: (arg) => new SinNode(arg),
    cos: (arg) => new CosNode(arg),
    tan: (arg) => new TanNode(arg),
    asin: (arg) => new AsinNode(arg),
    acos: (arg) => new AcosNode(arg),
    atan: (arg) => new AtanNode(arg),
    sinh: (arg) => new SinhNode(arg),
    cosh: (arg) => new CoshNode(arg),
    tanh: (arg) => new TanhNode(arg),
    exp: (arg) => new ExpNode(arg),
    log: (arg) => new LogNode(arg),
    sqrt: (arg) => new SqrtNode(arg),
    T: (arg) => new TransposeNode(arg),
    qrot: (arg) => new QrotNode(arg)
}

class ParserAst {

    constructor() {
        this._errors = [];
        const lexer = new Lexer();
        lexer.addRule(/\d+\.?\d*[eE][+-]?\d+/, k =>
            this._token = {
                text: k.text,
                type: NumberToken
            });
        lexer.addRule(/\d+\.?\d*/, k =>
            this._token = {
                text: k.text,
                type: NumberToken
            });
        lexer.addRule(/[a-zA-Z_][a-zA-Z0-9_]*/, k =>
            this._token = {
                text: k.text,
                type: IdToken
            });
        lexer.addRule(/\s/)
        lexer.addRule(/./, k =>
            this._token = {
                text: k.text,
                type: SymbolToken
            });
        this._lexer = lexer;
    }

    get errors() { return this._errors; }

    get token() {
        if (this._token === undefined) {
            this._lexer.lex();
        }
        return this._token;
    }

    addError(msg) {
        this._errors.push(msg);
        return this;
    }

    parse(code) {
        this._errors = [];
        this.discard();
        this._lexer.setSource(code);
        const result = this.parseExp();
        const token = this.token;
        if (token !== undefined) {
            this.addError('Unexpected token ' + token.text);
        }
        return result;
    }

    parseExp() {
        var node = this.parseSum();
        while (true) {
            const token = this.token;
            if (token === undefined) {
                return node;
            }
            switch (token.text) {
                case ',':
                    this.discard();
                    node = new CatNode(node, this.parseSum());
                    break;
                default:
                    return node;
            }
        }
    }

    parseSum() {
        var node = this.parseFactor();
        while (true) {
            const token = this.token;
            if (token === undefined) {
                return node;
            }
            switch (token.text) {
                case '+':
                    this.discard();
                    node = new AddNode(node, this.parseFactor());
                    break;
                case '-':
                    this.discard();
                    node = new SubNode(node, this.parseFactor());
                    break;
                default:
                    return node;
            }
        }
    }

    parseFactor() {
        var node = this.parseUnary();
        while (true) {
            const token = this.token;
            if (token === undefined) {
                return node;
            }
            switch (token.text) {
                case '*':
                    this.discard();
                    node = new MulNode(node, this.parseUnary());
                    break;
                case '/':
                    this.discard();
                    node = new DivNode(node, this.parseUnary());
                    break;
                default:
                    return node;
            }
        }
    }

    parseUnary() {
        const token = this.token;
        if (token === undefined) {
            this.addError('Expected unary expression');
            return DefaultNode;
        }
        const nodeGen = UnaryFunctions[token.text];
        if (nodeGen) {
            this.discard();
            return nodeGen(this.parseUnary());
        }

        switch (token.text) {
            case '+':
                this.discard();
                return this.parseUnary();
            case '-':
                this.discard();
                return new NegNode(this.parseUnary());
            default:
                return this.parsePwr();
        }
    }

    parsePwr() {
        var baseNode = this.parseTerm();
        while (true) {
            const token = this.token;
            if (token === undefined || token.text !== '^') {
                return baseNode;
            }
            this.discard();
            const expNode = this.parseUnary();
            baseNode = new PwrNode(baseNode, expNode);
        }
    }

    parseTerm() {
        function handleId(id) {
            const baseExp = id.match(/^e([0-9]+)$/);
            if (baseExp) {
                return new BaseNode(parseInt(baseExp[1], 10));
            }
            const identExp = id.match(/^I([0-9]+)$/);
            if (identExp) {
                return new IdentityNode(parseInt(identExp[1], 10));
            }
            return new RefNode(id);
        }

        const token = this.token;
        if (token === undefined) {
            this.addError('Expected terminal expression');
            return DefaultNode;
        } else {
            switch (token.type) {
                case NumberToken:
                    this.discard();
                    return new ConstantNode(Number(token.text));
                case SymbolToken:
                    switch (token.text) {
                        case '(': {
                            this.discard();
                            const value = this.parseExp();
                            this.expected(')');
                            return value;
                        }
                        case '|': {
                            this.discard();
                            const value = this.parseExp();
                            this.expected('|');
                            return new ModNode(value);
                        }
                        default:
                            this.discard();
                            this.addError('Unexpected token ' + token.text);
                            return this.parseTerm();
                    }
                case IdToken:
                    switch (token.text) {
                        case 'PI':
                            this.discard();
                            return new ConstantNode(Math.PI);
                        case 'E':
                        case 'e':
                            this.discard();
                            return new ConstantNode(Math.E);
                        case 'i':
                            this.discard();
                            return new ConstantNode([1, 0, 0, 0]);
                        case 'j':
                            this.discard();
                            return new ConstantNode([0, 1, 0, 0]);
                        case 'k':
                            this.discard();
                            return new ConstantNode([0, 0, 1, 0]);
                        case 'dt':
                            this.discard();
                            return new DtRefNode();
                        case 'ex':
                            this.discard();
                            return new BaseNode(0);
                        case 'ey':
                            this.discard();
                            return new BaseNode(1);
                        case 'ez':
                            this.discard();
                            return new BaseNode(2);
                        default:
                            this.discard();
                            return handleId(token.text);
                    }
                default:
            }
        }
    }

    expected(token) {
        if (!this.token) {
            this.addError('Expected ' + token + ' found end of text');
        } else if (this.token.text !== token) {
            this.addError('Expected ' + token + ' found ' + this.token.text);
        } else {
            this.discard();
        }
        return this;
    }

    discard() {
        delete this._token;
        return this;
    }
}

export { SystemParser };