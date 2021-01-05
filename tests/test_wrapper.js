// SPDX-License-Identifier: LGPL-3.0-or-later
// Copyright © 2020 fvtt-lib-wrapper Rui Pinheiro

'use strict';

import {CallOrderChecker} from './call_order_checker.js';
import {wrap_front, unwrap_all_from_obj, test_sync_async, async_retval} from './utilities.js';
import '../src/lib/lib-wrapper.js';


function setup() {
	libWrapper._unwrap_all();

	game.modules.clear();
	globalThis.A = undefined;
}


// Test the basic functionality of libWrapper
test_sync_async('Wrapper: Basic functionality', async function (t) {
	setup();
	const chkr = new CallOrderChecker(t);


	// Define class
	class A {};
	A.prototype.x = chkr.gen_fn('A:Orig');


	// Instantiate
	let a = new A();
	await chkr.call(a, 'x', ['A:Orig'], 'a.Orig');

	// First wrapper
	wrap_front(A.prototype, 'x', chkr.gen_wr('A:1'));
	await chkr.call(a, 'x', ['A:1','A:Orig'], 'a.A:1');

	// Second wrapper
	wrap_front(A.prototype, 'x', chkr.gen_wr('A:2'));
	await chkr.call(a, 'x', ['A:2','A:1','A:Orig'], 'a.A:2');

	// Manual wrapper
	A.prototype.x = chkr.gen_fn('Man:A:1');
	await chkr.call(a, 'x', ['A:2','A:1','Man:A:1'], 'a.Man:A:1');

	// Third wrapper
	wrap_front(A.prototype, 'x', chkr.gen_wr('A:3'));
	await chkr.call(a, 'x', ['A:3','A:2','A:1','Man:A:1'], 'a.A:3');

	// Second Manual Wrapper
	A.prototype.x = chkr.gen_fn('Man:A:2');
	await chkr.call(a, 'x', ['A:3','A:2','A:1','Man:A:2'], 'a.Man:A:2');


	// Wrap in the traditional way, by storing the prototype, and then modifying it
	A.prototype.x = (function() {
		const wrapped = A.prototype.x;
		return chkr.gen_fn('Man:A:3', wrapped);
	})();
	await chkr.call(a, 'x', ['A:3','A:2','A:1','Man:A:3','Man:A:2'], 'a.Man:A:3');


	// Fourth wrapper
	wrap_front(A.prototype, 'x', chkr.gen_wr('A:4'));
	await chkr.call(a, 'x', ['A:4','A:3','A:2','A:1','Man:A:3','Man:A:2'], 'a.Man:A:4');


	// Done
	t.end();
});



// Test the usual libWrapper syntax, i.e. do not use automations from CallOrderChecker
test_sync_async('Wrapper: libWrapper syntax', async function (t) {
	setup();


	// Define class
	class A {
		x(y,z) {
			return t.test_async ? async_retval(y + z) : (y + z);
		}
	}


	// Instantiate

	let a = new A();
	t.equal(await a.x(0,1), 1, 'Original #1');
	t.equal(await a.x(1,1), 2, 'Original #2');


	// Test 'wrapped(...args)'
	let wrapper1_check;
	wrap_front(A.prototype, 'x', async function(wrapped, ...args) {
		t.equal(await wrapped(...args), wrapper1_check, 'xWrapper 1');
		return args[0] - args[1];
	});

	wrapper1_check = 5;
	t.equal(await a.x(3,2), 1, "Wrapper1 #1");

	wrapper1_check = 20;
	t.equal(await a.x(10,10), 0, "Wrapper1 #2");


	// Test 'wrapped.apply(this, args)'
	let wrapper2_check;
	wrap_front(A.prototype, 'x', async function(wrapped, ...args) {
		t.equal(await wrapped.apply(this, args), wrapper2_check, 'xWrapper 2');
		return args[0] * args[1];
	});

	wrapper1_check = 15;
	wrapper2_check = 5;
	t.equal(await a.x(10,5), 50, "Wrapper2 #1");

	wrapper1_check = 6;
	wrapper2_check = -2;
	t.equal(await a.x(2,4), 8, "Wrapper2 #2");


	// Test 'wrapped.call(this, ...args)'
	let wrapper3_check;
	wrap_front(A.prototype, 'x', async function(wrapped, ...args) {
		t.equal(await wrapped.call(this, ...args), wrapper3_check, 'xWrapper 3');
		return Math.floor(args[0] / args[1]);
	});

	wrapper1_check = 6;
	wrapper2_check = 0;
	wrapper3_check = 9;
	t.equal(await a.x(3,3), 1, "Wrapper3 #1");

	wrapper1_check = 15;
	wrapper2_check = 1;
	wrapper3_check = 56;
	t.equal(await a.x(8,7), 1, "Wrapper3 #2");


	// Done
	t.end();
});



// Assign directly to an instance after wrapping the prototype
test_sync_async('Wrapper: Instance assignment', async function(t) {
	setup();
	const chkr = new CallOrderChecker(t);


	// Define class
	class A {};
	A.prototype.x = chkr.gen_fn('A:Orig');


	// Instantiate
	let a = new A();
	await chkr.call(a, 'x', ['A:Orig'], 'a.Orig');


	// Create a normal class wrapper
	wrap_front(A.prototype, 'x', chkr.gen_wr('A:1'));
	await chkr.call(a, 'x', ['A:1','A:Orig'], 'a.A:1');


	// Assign directly to a, not to A.prototype
	a.x = chkr.gen_fn('a:1');
	await chkr.call(a, 'x', ['A:1','a:1'], 'a.a:1');


	// Calling another instance should not include wrapper 'a1' in the wrapper chain
	let b = new A();
	await chkr.call(b, 'x', ['A:1','A:Orig'], 'b.Orig');


	// Create manual instance wrapper
	b.x = (function() {
		const wrapped = b.x;
		return chkr.gen_fn('Man:b:1', wrapped);
	})();
	await chkr.call(b, 'x', ['A:1','Man:b:1','A:Orig'], 'b.Man:b:1');


	// Done
	t.end();
});



// Test wrapping inherited methods
test_sync_async('Wrapper: Inherited Methods', async function(t) {
	setup();
	const chkr = new CallOrderChecker(t);


	// Define class
	class A {};
	A.prototype.x = chkr.gen_fn('A:Orig');

	class B extends A {};

	class C extends A {};

	class D extends A {};

	class E extends D {};
	E.prototype.x = chkr.gen_fn('E:Orig');

	class F extends A {
		// Long-form since we need to be inside the method to be able to use 'super'
		x(...args) {
			return chkr.gen_fn('F:Orig', super.x).apply(this, args);
		}
	}


	// Instantiate A
	let a = new A();
	await chkr.call(a, 'x', ['A:Orig'], 'a.Orig');


	// Instantiate B
	let b = new B();
	await chkr.call(b, 'x', ['A:Orig'], 'b.Orig');


	// Wrap class B
	wrap_front(B.prototype, 'x', chkr.gen_wr('B:1'));
	await chkr.call(b, 'x', ['B:1','A:Orig'], 'b.B:1');


	// Assign directly to b, not to B.prototype
	b.x = chkr.gen_fn('b:1');
	await chkr.call(b, 'x', ['B:1','b:1'], 'b.b:1');


	// Create manual instance wrapper
	b.x = (function() {
		const wrapped = b.x;
		return chkr.gen_fn('Man:b:1', wrapped);
	})();
	await chkr.call(b, 'x', ['B:1','Man:b:1','b:1'], 'b.Man:b:1');


	// Using another instance should not call b's instance wrappers
	let b2 = new B();
	await chkr.call(b2, 'x', ['B:1','A:Orig'], 'b2.Orig');


	// Using C will work correctly
	let c = new C();
	await chkr.call(c, 'x', ['A:Orig'], 'c.Orig');


	// Wrapping C's prototype will work
	wrap_front(C.prototype, 'x', chkr.gen_wr('C:1'));
	await chkr.call(c, 'x', ['C:1','A:Orig'], 'c.C:1');


	// Wrapping A's prototype will work
	wrap_front(A.prototype, 'x', chkr.gen_wr('A:1'));
	await chkr.call(a, 'x', ['A:1','A:Orig'], 'a.A:1');
	// And be seen by inherited classes
	await chkr.call(b2, 'x', ['B:1','A:1','A:Orig'], 'b2.A:1');
	await chkr.call(c, 'x', ['C:1','A:1','A:Orig'], 'c.A:1');


	// Instantiate E
	let e = new E();
	await chkr.call(e, 'x', ['E:Orig'], 'e.Orig');


	// Wrapping E's prototype will work
	// NOTE: This is inconsistent... Compare 'e.E:1' with 'e.Orig' above. 'A:1' only shows up once E is wrapped by libWrapper.
	//       This is because currently, inherited wrappers get priority over the original method of the child class. See github issue #13.
	wrap_front(E.prototype, 'x', chkr.gen_wr('E:1'));
	await chkr.call(e, 'x', ['E:1','A:1','E:Orig'], 'e.E:1');


	// Instantiate F
	// Using the 'super' construct will work, even if the inherited method is wrapped
	let f = new F();
	await chkr.call(f, 'x', ['F:Orig','A:1','A:Orig'], 'f.Orig');


	// Using the 'super' construct will work, even if the method itself is wrapped
	// NOTE: As before, there is an inconsistency here due to inherited wrappers getting priority. Perhaps this should be ['F:1','F:Orig','A:1','A:Orig']?
	//       This is because currently, inherited wrappers get priority over the original method of the child class. See github issue #13.
	wrap_front(F.prototype, 'x', chkr.gen_wr('F:1'));
	await chkr.call(f, 'x', ['F:1','A:1','F:Orig','A:Orig'], 'f.F:1');



	// Done
	t.end();
});