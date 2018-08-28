'use strict';

import {SystemParser} from './leibniz-ast-0.1.0'

function assert(condition, message) {
    if (!condition) {
        throw new Error(message || 'Assert failed');
    }
}

function createTestSystem() {
    const conf = {
        "funcs": {
            "r": "1",
            "omega00": "2*PI",
            "omega01": "2*PI/2",
            "omega02": "2*PI/4",
            "omega10": "2*PI/0.3",
            "omega11": "2*PI/0.5",
            "omega12": "2*PI/0.7",
            "axis0": "ex",
            "axis1": "ey",
            "axis2": "ez"
        },
        "vars": {
            "theta0": "0",
            "theta1": "0.1",
            "theta2": "0.2",
            "phi0": "0",
            "phi1": "0",
            "phi2": "0"
        },
        "update": {
            "phi0": "phi0 + omega00 * dt",
            "phi1": "phi1 + omega01 * dt",
            "phi2": "phi2 + omega02 * dt",
            "theta0": "theta0 + omega10 * dt",
            "theta1": "theta1 + omega11 * dt",
            "theta2": "theta2 + omega12 * dt",
        },
        "bodies": [
            {
                "position": "r * (cos(phi0) * ex + sin(phi0) * ey)",
                "rotation": "qrot(axis0 * theta0)"
            },
            {
                "position": "r * (cos(phi1) * ex + sin(phi1) * ey)",
                "rotation": "qrot(axis1 * theta1)"
            },
            {
                "position": "r * (cos(phi2) * ex + sin(phi2) * ey)",
                "rotation": "qrot(axis1 * theta1)"
            }
        ]
    };
    
    const result = new SystemParser(conf).parse(conf);
    const system = result.system;
    assert(system, JSON.stringify(result.errors, null, 2));
    
    return system;
}

export { createTestSystem };
