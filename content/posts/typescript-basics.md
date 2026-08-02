---
title: TypeScript 基础
slug: typescript-basics
publishedAt: "2026-03-01"
date: "2026.03.01"
category: 前端开发
excerpt: 从基本数据类型、变量声明、接口、类、函数、泛型、类型推论到模块，梳理 TypeScript 的常用基础知识。
readTime: 18 分钟
---

# TypeScript
## 为什么会有 TypeSCript ？
可以简单的理解为 TS 是 JavaScript 的加强版， JS 本身属于弱语言类型，TS 能在编译阶段提前发现可能的错误，一句话总结。
> TypeScript = JavaScript + 类型系统（type system）
> TypeScript = 更严格、更聪明的 JavaScript，让你在编写代码时就能发现 bug，并获得更好的自动补全。
## 基本数据类型
TS 相比于JS 多了枚举类型
### 布尔值（boolean）
```ts
let isDone : boolean = false;
```
### 数字（number）
在 TS 与 JS 中所有数字都是浮点数。TS 还支持二进制和八进制字面量
```ts
let decLiteral: number = 6;
let hexLiteral: number = 0xf00d; //十六进制
let binaryLiteral: number = 0b1010; // 二进制
let octalLiteral: number = 0o744; // 八进制
```
### 字符串（string）
```ts
let name: string = "yuhao";
// 模版字符串
let template: string = `nihao,
woshimobanzifuchuang
`;
```
### 数组
在 TS 中有两种方式声明数组
```ts
// 1. 使用类型 + []
let nums: number[] = [1,2,3];
// 2. 使用数组泛型
let nums: Array<string> = ["nihao","TS"];
```
### 元组（Tuple）
在 JS 中并未内置元组
```ts
// 声明
let x: [string, number];
x = ["yuhao", 100];
```
### 枚举（enum）
枚举类型是对 JS 的一个补充。数字枚举是默认类型，成员的值从0开始自动递增。可以手动指定初始值，后续成员会在此基础上递增。
```ts
enum Direction {
  Up,      // 0
  Down,    // 1
  Left,    // 2
  Right    // 3
}

enum Status {
  Success = 200,
  NotFound = 404,
  Error = 500
}

```
### 任意值（any）
有时候，我们会想要为那些在编程阶段还不清楚类型的变量指定一个类型。 这些值可能来自于动态的内容，比如来自用户输入或第三方代码库。 这种情况下，我们不希望类型检查器对这些值进行检查而是直接让它们通过编译阶段的检查。 那么我们可以使用any类型来标记这些变量：
```ts
let notKnow: any 
```
## 变量声明
###  ~~var~~（不推荐使用）
### var的缺陷  

#### 变量提升（Hoisting）  
var 声明的变量会提升到当前作用域顶部，导致变量在声明前可以被访问。这可能导致意外行为，例如访问未初始化的变量（值为 undefined）。  

```javascript
console.log(a); // undefined，而非报错  
var a = 10;  
```

#### 无块级作用域  
var 的作用域是函数级或全局，而非块级（如 if、for 等代码块）。在块中声明的变量会泄漏到外层作用域。  

```javascript
if (true) {  
    var b = 20;  
}  
console.log(b); // 20，变量泄漏到全局  
```

#### 允许重复声明  
同一作用域内重复声明 var 变量不会报错，可能导致变量被意外覆盖。  

```javascript
var c = 30;  
var c = 40; // 无错误，变量被覆盖  
console.log(c); // 40  
```

#### 全局污染风险  
在非严格模式下，未声明的变量赋值会隐式创建全局变量（挂载到 window 对象），污染全局作用域。  

```javascript
function test() {  
    d = 50; // 未使用 var/let/const，自动变为全局变量  
}  
test();  
console.log(window.d); // 50  
```

#### 无法实现常量声明  
var 无法声明不可变的常量，缺乏类似 const 的不可变性机制，容易因重新赋值导致逻辑错误。  

```javascript
var PI = 3.14;  
PI = 3.14159; // 允许修改，无法保证常量性  
```

#### 解决方案  
推荐使用 let 和 const 替代 var，以解决上述问题：  
- **let**：提供块级作用域，禁止重复声明，无变量提升。  
- **const**：额外保证变量不可重新赋值（注：对象属性仍可修改）。  

```javascript
let e = 60;  
// let e = 70; // 报错，禁止重复声明  

const F = 80;  
// F = 90; // 报错，禁止重新赋值  
```
## 接口
### 接口的定义与用途  
TypeScript（TS）接口是一种用于定义对象结构的类型约束，通过 `interface` 关键字声明。接口不包含具体实现，仅描述对象的属性、方法或类的公共契约，用于类型检查和提高代码可维护性。  

### 基本语法  
```typescript
interface User {
  id: number;
  name: string;
  age?: number; // 可选属性
  readonly createdAt: Date; // 只读属性
  greet(): void; // 方法定义
}
```

### 接口的常见用法  
**1. 对象类型约束**  
```typescript
const user: User = {
  id: 1,
  name: "Alice",
  createdAt: new Date(),
  greet() {
    console.log(`Hello, ${this.name}`);
  },
};
```

**2. 函数类型定义**  
```typescript
interface SearchFunc {
  (source: string, keyword: string): boolean;
}

const search: SearchFunc = (src, kw) => src.includes(kw);
```

**3. 类实现接口**  
```typescript
interface ClockInterface {
  currentTime: Date;
  setTime(d: Date): void;
}

class Clock implements ClockInterface {
  currentTime: Date = new Date();
  setTime(d: Date) {
    this.currentTime = d;
  }
}
```

### 接口的高级特性  
**1. 继承扩展**  
```typescript
interface AdminUser extends User {
  permissions: string[];
}
```

**2. 索引签名**  
允许动态属性名：  
```typescript
interface StringArray {
  [index: number]: string;
}
const arr: StringArray = ["a", "b"];
```

**3. 混合类型**  
结合函数和对象：  
```typescript
interface Counter {
  (start: number): string;
  interval: number;
  reset(): void;
}
```

### 接口与类型别名的区别  
- **接口**：支持声明合并（多次定义自动合并），更适合扩展和面向对象场景。  
- **类型别名**（`type`）：支持联合类型、交叉类型等复杂类型运算。  

### 实际应用场景  
- API 响应数据的类型定义。  
- 第三方库的类型扩展（通过声明合并）。  
- 组件 Props 的类型约束（如 React + TypeScript）。  

通过合理使用接口，可以显著提升代码的健壮性和可读性。
## 类
如果你熟悉 Java 会发现 TS 的类与 Java 十分类似
### TypeScript 类的基本语法

TypeScript 类通过 `class` 关键字定义，支持成员属性、构造函数和方法。以下是基本结构：

```typescript
class Person {
  name: string;
  age: number;

  constructor(name: string, age: number) {
    this.name = name;
    this.age = age;
  }

  greet() {
    return `Hello, ${this.name}`;
  }
}
```

### 访问修饰符
TypeScript 提供三种访问修饰符控制成员可见性：
- `public`：默认修饰符，成员在任何地方可访问
- `private`：仅在类内部可访问
- `protected`：在类及其子类中可访问

```typescript
class Example {
  public publicProp = 1;
  private privateProp = 2;
  protected protectedProp = 3;
}
```

### 继承与多态
使用 `extends` 实现继承，支持方法重写（override）：

```typescript
class Animal {
  move() {
    console.log("Moving");
  }
}

class Dog extends Animal {
  move() {
    console.log("Running");
  }
}
```

### 抽象类
抽象类通过 `abstract` 定义，不能直接实例化，需子类实现抽象成员：

```typescript
abstract class Shape {
  abstract getArea(): number;
}

class Circle extends Shape {
  constructor(private radius: number) {
    super();
  }

  getArea() {
    return Math.PI * this.radius ** 2;
  }
}
```

### 静态成员
静态成员属于类本身而非实例，通过 `static` 声明：

```typescript
class MathUtils {
  static PI = 3.14;

  static sum(a: number, b: number) {
    return a + b;
  }
}

console.log(MathUtils.sum(1, 2));
```

### 接口实现
类可以通过 `implements` 实现一个或多个接口：

```typescript
interface Loggable {
  log(): void;
}

class Logger implements Loggable {
  log() {
    console.log("Logged");
  }
}
```

### 属性存取器
通过 `get` 和 `set` 实现属性拦截：

```typescript
class Temperature {
  private _celsius = 0;

  get celsius() {
    return this._celsius;
  }

  set celsius(value) {
    this._celsius = value;
  }
}
```

### 泛型类
类可以结合泛型实现类型参数化：

```typescript
class Box<T> {
  content: T;

  constructor(value: T) {
    this.content = value;
  }
}

const stringBox = new Box("hello");
```

## 函数
### TypeScript 函数基础语法

TypeScript 函数的定义方式与 JavaScript 类似，但增加了类型注解：

```typescript
function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

- 参数 `name` 指定为 `string` 类型
- 返回值通过 `: string` 指定返回类型

### 可选参数与默认参数

```typescript
function buildName(firstName: string, lastName?: string) {
  return lastName ? `${firstName} ${lastName}` : firstName;
}

function discount(price: number, rate: number = 0.1) {
  return price * (1 - rate);
}
```

- 使用 `?` 标记可选参数
- 通过 `=` 赋默认值，默认参数自动成为可选参数

### 剩余参数

```typescript
function sum(...numbers: number[]): number {
  return numbers.reduce((a, b) => a + b, 0);
}
```

- 使用 `...` 语法收集剩余参数为数组
- 必须指定数组元素类型

### 函数类型

可以为函数定义类型：

```typescript
type MathOperation = (x: number, y: number) => number;

const add: MathOperation = (a, b) => a + b;
```

- 使用箭头语法定义函数类型
- 参数列表和返回类型都必须匹配

### 泛型函数

```typescript
function identity<T>(arg: T): T {
  return arg;
}

const output = identity<string>("hello");
```

- 使用 `<T>` 声明类型参数
- 调用时可显式指定或让编译器推断类型

### 异步函数

```typescript
async function fetchData(url: string): Promise<Response> {
  const response = await fetch(url);
  return response.json();
}
```

- `async/await` 语法与 ES2017 相同
- 返回类型应为 `Promise<T>`### 什么是 TypeScript 泛型

TypeScript 泛型（Generics）是一种允许在定义函数、接口或类时使用类型参数的机制。泛型的主要目的是提高代码的复用性和类型安全性，避免重复编写相似逻辑的代码。
## 泛型
### 泛型的基本语法

泛型通常使用尖括号 `<T>` 定义，其中 `T` 是类型参数的占位符。可以根据实际需求定义多个类型参数，例如 `<T, U, V>`。

```typescript
function identity<T>(arg: T): T {
    return arg;
}
```

### 泛型函数

泛型函数允许在调用时动态指定类型。例如：

```typescript
function logAndReturn<T>(value: T): T {
    console.log(value);
    return value;
}

const num = logAndReturn<number>(42); // 显式指定类型
const str = logAndReturn("hello");    // 类型推断
```

### 泛型接口

泛型接口可以定义灵活的数据结构。例如：

```typescript
interface KeyValuePair<K, V> {
    key: K;
    value: V;
}

const pair: KeyValuePair<string, number> = {
    key: "age",
    value: 30
};
```

### 泛型类

泛型类允许在类定义中使用类型参数。例如：

```typescript
class Box<T> {
    private content: T;

    constructor(value: T) {
        this.content = value;
    }

    getValue(): T {
        return this.content;
    }
}

const stringBox = new Box<string>("TypeScript");
```

### 泛型约束

通过 `extends` 关键字可以对泛型类型进行约束，限制其必须满足某些条件。例如：

```typescript
interface Lengthwise {
    length: number;
}

function loggingLength<T extends Lengthwise>(arg: T): void {
    console.log(arg.length);
}

loggingLength("hello"); // 5
loggingLength([1, 2, 3]); // 3
```

### 默认泛型参数

可以为泛型参数指定默认类型。例如：

```typescript
function createArray<T = string>(length: number, value: T): T[] {
    return Array(length).fill(value);
}

const strArray = createArray(3, "default");
const numArray = createArray<number>(3, 0);
```

### 泛型工具类型

TypeScript 提供了一些内置的泛型工具类型，例如 `Partial`、`Readonly`、`Pick` 等。

```typescript
interface User {
    name: string;
    age: number;
}

type PartialUser = Partial<User>; // { name?: string; age?: number }
type ReadonlyUser = Readonly<User>; // { readonly name: string; readonly age: number }
type UserName = Pick<User, "name">; // { name: string }
```

### 泛型与条件类型

条件类型允许根据条件选择不同的类型。例如：

```typescript
type Check<T> = T extends string ? "string" : "other";

type A = Check<string>; // "string"
type B = Check<number>; // "other"
```

### 泛型的使用场景

泛型适用于以下场景：
- 需要处理多种类型但逻辑相同的函数或类
- 定义可复用的数据结构，如集合、映射等
- 实现类型安全的 API 设计，避免冗余的类型定义

通过合理使用泛型，可以显著提高代码的灵活性和可维护性。
## 类型推论
TS 当中未明确指定类型，可以通过类型推论提供类型
```ts
let x = 3; // x 被推断为number类型
```
### 通用类型
当需要从几个表达式中推断类型，会使用这些表达式的类型来推断出一个最合适的通用类型。
```ts
let x = [1, 2, null];
```
### 联合类型
当无法找到最佳通用类型，会被推断为联合数组类型
```ts
let zoo = [new Rhino(), new Elephant(), new Snake()];
```
## 高级类型
### 交叉类型
#### 交叉类型的概念

交叉类型（Intersection Types）是一种将多个类型合并为一个类型的机制。新类型包含了所有被合并类型的属性和方法。在TypeScript中，交叉类型使用 `&` 符号表示。

#### 交叉类型的基本用法

定义一个交叉类型可以通过简单地将多个类型通过 `&` 连接起来：

```typescript
type A = { a: number };
type B = { b: string };
type C = A & B;

const obj: C = { a: 1, b: 'hello' };
```

#### 交叉类型与接口的区别

交叉类型与接口的 `extends` 关键字功能类似，但交叉类型更灵活，可以合并任意类型，包括接口、类型别名、字面量类型等。

```typescript
interface A { a: number; }
interface B { b: string; }
type C = A & B;

const obj: C = { a: 1, b: 'hello' };
```

#### 交叉类型的实际应用场景

- **合并多个对象类型**：将多个对象的属性合并为一个新的类型。
- **组合函数类型**：将多个函数的签名合并为一个新的函数类型。
- **与联合类型配合使用**：在复杂类型操作中，交叉类型常与联合类型结合使用。

#### 交叉类型的注意事项

- **属性冲突**：如果交叉类型的属性名相同但类型不同，会导致类型冲突，结果为 `never` 类型。
  
  ```typescript
  type A = { a: number };
  type B = { a: string };
  type C = A & B; // a 的类型为 never
  ```

- **原始类型交叉**：原始类型（如 `string & number`）的交叉会导致 `never` 类型，因为它们无法同时满足。

### 交叉类型示例

合并两个对象类型并添加额外属性：

```typescript
type Person = { name: string };
type Employee = { id: number };
type Manager = Person & Employee & { department: string };

const manager: Manager = {
  name: 'Alice',
  id: 1,
  department: 'Engineering',
};
```

#### 交叉类型与泛型结合

交叉类型可以与泛型结合，实现更灵活的代码复用：

```typescript
function merge<T, U>(obj1: T, obj2: U): T & U {
  return { ...obj1, ...obj2 };
}

const result = merge({ a: 1 }, { b: 'hello' }); // result 的类型为 { a: number } & { b: string }
```

#### 总结

交叉类型是一种强大的工具，能够将多个类型合并为一个新类型。它在组合对象、函数等复杂类型时非常有用，但需要注意属性冲突的问题。通过合理使用交叉类型，可以显著提升代码的灵活性和可维护性。
### 联合类型
联合类型表示一个值可以是几种类型之一。 我们用竖线（`|`）分隔每个类型，所以`number | string | boolean`表示一个值可以是`number`，`string`，或`boolean`。
如果一个值是联合类型，我们只能访问此联合类型的所有类型里==共有的成员==。
```ts
interface Bird {
    fly();
    layEggs();
}

interface Fish {
    swim();
    layEggs();
}

function getSmallPet(): Fish | Bird {
    // ...
}

let pet = getSmallPet();
pet.layEggs(); // okay
pet.swim();    // errors
```
### 类型保护
TypeScript 的 **类型保护（Type Guard）** 是一个非常核心的概念，用来让 TypeScript 在特定的代码块里自动判断、缩小变量的类型，让你写代码更安全。

一句话总结：

> **类型保护 = 用某种方式告诉 TypeScript：在这个代码块里，这个值是什么类型。**


---

#### ⭐ 为什么需要类型保护？

假设一个函数的参数有多种可能：

```ts
function print(value: string | number) {
  console.log(value.toUpperCase()); // ❌ 报错
}
```

因为 `number` 没有 `toUpperCase`，TS 不允许你直接调用。

你就需要告诉 TS：

* 如果是 string → 可以调用 toUpperCase
* 如果是 number → 不能

这就是 **类型保护**。

---

#### 🔥 TypeScript 内置 4 大类型保护方式

##### 1. `typeof`

用于判断 **原始类型**：string、number、boolean、symbol 等

```ts
function print(value: string | number) {
  if (typeof value === "string") {
    value.toUpperCase(); // ✔️ string
  } else {
    value.toFixed(2);    // ✔️ number
  }
}
```

---

##### 2. `instanceof`

用于判断 **是否是某个类的实例**

```ts
class Dog { bark() {} }
class Cat { meow() {} }

function speak(animal: Dog | Cat) {
  if (animal instanceof Dog) {
    animal.bark(); // ✔️ Dog
  } else {
    animal.meow(); // ✔️ Cat
  }
}
```

---

##### 3. `in`

用于判断 **对象是否含有某个属性**

适合处理 **两种对象形状不同的情况（可辨识联合类型）**：

```ts
type User = { name: string; age: number }
type Admin = { name: string; permissions: string[] }

function printUser(u: User | Admin) {
  if ("permissions" in u) {
    console.log(u.permissions); // ✔️ Admin
  } else {
    console.log(u.age);         // ✔️ User
  }
}
```

---

##### 4. 自定义类型保护（非常重要）

自己写一个函数，让 TS 明确知道某类型判断逻辑：

```ts
function isDog(animal: Dog | Cat): animal is Dog {
  return animal instanceof Dog;
}
```

使用：

```ts
if (isDog(animal)) {
  animal.bark();  // ✔️ TS 知道是 Dog
} else {
  animal.meow();  // ✔️ TS 知道是 Cat
}
```

这是 TS 高级技巧，非常实用。

---

#### 🔥 5. “可辨识联合类型” + 字段类型判断

判断联合类型中标识字段：

```ts
type Shape =
  | { kind: "circle"; radius: number }
  | { kind: "square"; size: number };

function area(shape: Shape) {
  if (shape.kind === "circle") {
    return Math.PI * shape.radius ** 2;
  } else {
    return shape.size ** 2;
  }
}
```

`kind` 这个字段就是 **区分类型的标识**。

---

#### ⭐ 最重要的 3 个关键词

##### 1. Type Narrowing（类型收窄）

根据条件判断，TS 自动推断更具体的类型。

##### 2. Union Types（联合类型）

类型保护常用于处理 `A | B` 这种类型。

##### 3. Control Flow (控制流分析)

TS 会根据你的代码逻辑自动修改推断结果。

---

#### 📘 总结

| 类型保护方式             | 适用情况                          |
| ------------------ | ----------------------------- |
| `typeof`           | 判断原始类型（string/number/boolean） |
| `instanceof`       | 判断类实例                         |
| `in`               | 判断对象有没有某属性                    |
| `x is T`           | 自定义类型保护（最强）                   |
| 字段区分（tagged union） | 判断对象的 discriminant 字段         |

---

## Symbol

`Symbol` 是 ES6 提供的一种 **原始数据类型（primitive type）**，用于创建独一无二的值。它的主要作用是在对象中定义**不会与其他属性冲突的键（key）**，常用于大型项目、框架源码或库的内部实现。

### 1. 创建 Symbol

```js
const s = Symbol();
const s2 = Symbol("description");
```

### 2. Symbol 的特点

* **唯一性**：即使描述一样，两个 Symbol 也不相等

  ```js
  Symbol("id") === Symbol("id"); // false
  ```
* **不可自动转为字符串**（避免被误用）

  ```js
  console.log(Symbol("x") + ""); // ❌ 报错
  ```
* 可以用 `String()` 或 `toString()` 手动转换

  ```js
  String(Symbol("x"));
  ```

### 3. 作为对象的 key 使用（最核心用途）

```js
const id = Symbol("id");
const user = {
  [id]: 123,
  name: "Alice"
};
```

Symbol key **不会被 for...in、Object.keys() 等枚举到**，因此非常适合作为内部属性。

### 4. 获取 Symbol 属性

普通方式获取不到：

```js
Object.keys(user); // []
```

必须使用：

```js
Object.getOwnPropertySymbols(user); // [Symbol(id)]
```

### 5. 全局 Symbol 注册表

使用 `Symbol.for()` 可以创建或读取一个全局共享的 Symbol：

```js
const a = Symbol.for("key");
const b = Symbol.for("key");

console.log(a === b); // true
```

### 6. 常见内置 Symbol（高级）

JavaScript 内置了一些“魔术 Symbol”，用来定制对象行为，例如：

* `Symbol.iterator`：让对象可迭代
* `Symbol.toStringTag`：自定义 `Object.prototype.toString` 输出
* `Symbol.asyncIterator`：支持 `for await...of`
* `Symbol.hasInstance`：自定义 `instanceof` 行为

例子：

```js
const obj = {
  [Symbol.toStringTag]: "CustomObject"
};

console.log(obj.toString()); // [object CustomObject]
```

---

## TypeScript 的模块

TypeScript 的模块（Module）用于组织代码、拆分文件、隔离作用域，并通过 `import` 与 `export` 实现文件之间的依赖关系。它基于 ES6 模块语法，同时扩展了针对类型的专属能力，使得在构建大型项目时结构更加清晰、安全、易维护。

在 TypeScript 中，只要文件中出现了 `import` 或 `export`，这个文件就被视为一个模块。否则，它就是一个脚本（Script），其顶级变量会进入全局作用域。

---

### 一、为什么需要模块系统？

在 JavaScript/TypeScript 项目变大之后，你会遇到以下问题：

1. 全局变量污染，变量名冲突难以避免
2. 代码分散难以组织，不同文件间依赖混乱
3. 一个文件越来越大，不利于维护
4. 团队多人协作时常发生变量覆盖问题

模块化正是为了解决这些问题而存在的，它能带来：

* **独立作用域**：模块之间的代码互不影响
* **清晰的依赖关系**：每个模块都清楚地声明自己依赖什么
* **易维护性**：文件功能单一、职责明确
* **可复用性**：模块可以被多个文件引用

---

### 二、模块基本语法：export 与 import

模块最核心的概念就是“导出”与“导入”。

#### 1. 导出（export）

可以导出变量、常量、函数、类、类型等。

```ts
// math.ts
export const PI = 3.14159;

export function add(a: number, b: number) {
  return a + b;
}

export class Circle {
  constructor(public radius: number) {}
}
```

还可以导出类型：

```ts
export type ID = string | number;
export interface User {
  name: string;
  age: number;
}
```

#### 2. 默认导出（default export）

每个模块最多只能有一个：

```ts
export default function log(msg: string) {
  console.log(msg);
}
```

#### 3. 导入（import）

```ts
import { PI, add } from './math';
import log from './logger';        // 默认导出
import * as Utils from './utils';  // 全部导入
```

也可以重新命名：

```ts
import { add as sum } from './math';
```

---

### 三、TypeScript 特有的模块能力

#### 1. `import type` —— 只导入类型，不产生运行时代码

```ts
import type { User } from './types';
```

用于优化构建和减少打包体积。

#### 2. 可以导出类型（JavaScript 做不到）

```ts
export type Point = { x: number; y: number };
```

#### 3. `declare module` —— 声明第三方库的类型（DTS 文件）

用于给没有类型声明的库手动补充类型定义：

```ts
declare module 'some-lib' {
  export function test(): void;
}
```

---

### 四、模块解析（Module Resolution）

TypeScript 会根据导入路径寻找对应文件，这叫模块解析策略。

两种主要模式：

1. **Classic**（老旧）
2. **Node**（最常用，对应 Node.js 和现代构建工具）

示例：

```ts
import { foo } from './utils';
```

TypeScript 会按顺序尝试解析：

* `utils.ts`
* `utils.tsx`
* `utils.d.ts`
* `utils/index.ts`
* `utils/index.tsx`
* `utils/index.d.ts`

编译器根据配置 `moduleResolution` 控制具体策略。

---

### 五、模块的输出格式

TypeScript 支持将代码编译成以下 JS 模块格式：

* **ESM（ES Module）**：`import` / `export`
* **CommonJS（CJS）**：`require()` / `module.exports`
* **UMD**：兼容 Node + 浏览器
* **AMD / System**（老旧，不常用）

配置：

```json
{
  "compilerOptions": {
    "module": "ESNext"   // 或 "CommonJS"
  }
}
```

---

### 六、模块 vs 脚本（Script）

| 特性                 | 模块（Module） | 脚本（Script） |
| ------------------ | ---------- | ---------- |
| 是否有自己的作用域          | ✔️         | ❌（共享全局）    |
| 是否允许 import/export | ✔️         | ❌          |
| 是否适合大型项目           | ✔️         | ❌          |
| 是否会污染全局            | ❌          | ✔️         |

几乎所有 TypeScript 项目都会使用模块模式。

---

### 七、模块命名空间（Namespace）与模块的关系

TypeScript 还存在一种旧时代概念叫 **命名空间（namespace）**，用于在一个文件内部组织代码，但它不能跨文件共享，不属于现代标准。

现代开发推荐使用 ES 模块，而不是 namespace。

---

### 八、模块的最佳实践

1. 一个文件就是一个模块
2. 每个模块职责单一（单一责任原则）
3. 优先使用 ES Module
4. 类型与实现可分离（`type` 文件夹）
5. 适当使用默认导出，但尽量倾向命名导出（更易重构）

---


##  命名空间（Namespace）

命名空间（namespace）是 TypeScript 提供的一种 **组织代码的方式**，用于把函数、变量、接口、类等**包裹在一个独立作用域里**，避免全局污染。

### 1. 基本用法

```ts
namespace MyMath {
  export function add(a: number, b: number) {
    return a + b;
  }

  export function multiply(a: number, b: number) {
    return a * b;
  }
}

// 使用
console.log(MyMath.add(2, 3));      // 5
console.log(MyMath.multiply(2, 3)); // 6
```

* `namespace MyMath { ... }`：创建一个命名空间
* `export`：导出命名空间内部成员
* 使用时通过 `MyMath.成员名` 访问

---

### 2. 嵌套命名空间

```ts
namespace MyMath {
  export namespace Geometry {
    export const PI = 3.14159;
    export function areaCircle(radius: number) {
      return PI * radius ** 2;
    }
  }
}

console.log(MyMath.Geometry.areaCircle(2)); // 12.56636
```

---

### 3. 与模块的区别

| 特性          | 命名空间（namespace）        | 模块（Module）             |
| ----------- | ---------------------- | ---------------------- |
| 范围          | 文件内或全局                 | 文件级别独立作用域              |
| 导入方式        | 不需要 `import`，通过 `.` 访问 | 需要 `import` / `export` |
| 适用场景        | 组织大量相关全局变量（旧写法）        | 现代项目开发、跨文件引用           |
| 是否符合 ES6 标准 | 否                      | 是                      |

> **小结**：命名空间更像是 TypeScript 特有的“老式组织方式”，现代开发推荐用模块（import/export）替代命名空间。

---

### 4. 什么时候可以用命名空间

* 项目很小，或者所有代码都在一个文件中
* 需要把一组工具函数、类型或常量组织起来
* 避免全局变量冲突，但不想使用模块系统

---

### 5. 示例：命名空间 vs 模块

**命名空间版本：**

```ts
namespace Utils {
  export function greet(name: string) {
    return `Hello, ${name}`;
  }
}

console.log(Utils.greet("Alice"));
```

**模块版本（推荐）：**

```ts
// utils.ts
export function greet(name: string) {
  return `Hello, ${name}`;
}

// main.ts
import { greet } from './utils';
console.log(greet("Alice"));
```

模块方式更符合现代标准，支持跨文件引用，也便于团队协作。

---


