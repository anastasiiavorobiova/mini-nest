# mini-nest

Власний IoC-контейнер на TypeScript і `reflect-metadata`, який робить те саме, що NestJS під капотом: читає типи параметрів конструктора з метаданих і сам збирає граф залежностей.

Це **частина 1 з 3**: контейнер, `@Injectable()`, `@Inject(token)`, скоупи й детекція циклів.

## Як запустити

Потрібні Node.js 24 і npm 11 (версія зафіксована в `.nvmrc`).

```bash
npm ci
npm test
```

У Docker, на multi-stage образі:

```bash
docker compose run --rm api npm test
```

Compose автоматично підхоплює `docker-compose.override.yml`: стадія `dev` з усіма залежностями, а `./src` і `./test` змонтовано в контейнер лише для читання, тож зміни в коді й тестах видно без перезбірки. Перезбирати (`--build`) потрібно лише після зміни `package.json` чи `tsconfig*.json`.

| Команда | Що запускає |
|---|---|
| `docker compose run --rm api npm test` | тести в dev-образі |
| `docker compose up` | dev-образ з `tsc --watch` |
| `docker compose -f docker-compose.yml build` | лише prod-образ (стадія `runner`): production-залежності і скомпільований `dist/`, без TypeScript і тестів, від користувача `node` |

| Скрипт | Що робить |
|---|---|
| `npm test` | компілює `src/` і `test/` через `tsc` в окремий `dist-test/` і запускає `node:test` |
| `npm run typecheck` | перевірка типів без збірки |
| `npm run build` | збирає лише `src/` у `dist/` (`tsconfig.build.json`), звідки його запускає `npm start` |
| `npm run dev` | те саме, що `build`, у режимі `--watch` |

## Приклад

```ts
import "reflect-metadata";
import { CONFIG, Container, Inject, Injectable } from "./main.js";

interface Config {
  apiUrl: string;
}

@Injectable()
class HttpClient {
  constructor(@Inject(CONFIG) private config: Config) {}

  get(path: string) {
    return `GET ${this.config.apiUrl}${path}`;
  }
}

@Injectable({ scope: "transient" })
class UserService {
  constructor(private http: HttpClient) {}

  findAll() {
    return this.http.get("/users");
  }
}

const container = new Container().register(CONFIG, {
  useValue: { apiUrl: "https://api.example.com" },
});

container.resolve(UserService).findAll(); // "GET https://api.example.com/users"
```

`HttpClient` контейнер знаходить за типом параметра. `Config` — інтерфейс, у рантаймі його немає, тому для нього потрібен явний токен.

## API

| | |
|---|---|
| `@Injectable(options?)` | позначає клас як придатний до створення контейнером. `options.scope`: `"singleton"` (за замовчуванням) або `"transient"` |
| `@Inject(token)` | на параметрі конструктора: резолвити за токеном (`Symbol`, рядок або клас), а не за типом |
| `container.register(token, provider)` | `{ useValue: значення }` або `{ useClass: Клас }`. Зареєстрований провайдер має пріоритет і над класом з тим самим токеном, тож так можна підмінити реалізацію моком у тестах |
| `container.resolve(token)` | повертає екземпляр із повністю зібраним графом залежностей |

| Скоуп | Поведінка |
|---|---|
| `singleton` | один екземпляр на контейнер: `resolve(X) === resolve(X)` |
| `transient` | новий екземпляр на кожен `resolve` |

## Як це працює

`design:paramtypes` бере не контейнер і не рантайм, а компілятор TypeScript. Коли увімкнено `emitDecoratorMetadata`, для кожного класу, на якому є хоч один декоратор, `tsc` дописує в результат виклик `__metadata("design:paramtypes", [...])` зі списком типів параметрів конструктора. Ось що він генерує для `HttpClient` з прикладу вище:

```js
HttpClient = __decorate([
    Injectable(),
    __param(0, Inject(CONFIG)),
    __metadata("design:paramtypes", [Object])
], HttpClient);
```

`__metadata` — це обгортка над `Reflect.metadata` з пакета `reflect-metadata`, яка зберігає значення через `Reflect.defineMetadata`. Сам `@Injectable()` робить лише ще один такий виклик: кладе в метадані класу позначку та скоуп. Контейнер потім читає типи через `Reflect.getMetadata("design:paramtypes", Target)` і рекурсивно створює кожну залежність.

Звідси кілька наслідків:

- **Без `emitDecoratorMetadata` нічого не буде.** Компілятор не згенерує `__metadata`, контейнер отримає порожній список і викличе конструктор без аргументів. Те саме з класом без жодного декоратора: метадані генеруються лише для декорованих класів.
- **Інтерфейси перетворюються на `Object`**, примітиви — на `Number`, `String` тощо. Типи TypeScript у рантайм не потрапляють, тому для інтерфейсу видно лише `Object`. Саме для цього існує `@Inject(token)`: це наслідок стирання типів, а не обмеження контейнера.
- **`import "reflect-metadata"` має стояти першим рядком** точки входу (`src/main.ts`) і тестового setup-файлу (`test/setup.ts`). Без нього `Reflect.defineMetadata` не існує: `@Injectable()` впаде з `TypeError` ще під час завантаження модуля, а `__metadata` мовчки нічого не запише. Для надійності цей імпорт стоїть і в кожному модулі, що працює з `Reflect` (`container.ts`, `decorators/*.ts`): в ESM залежності виконуються раніше за тіло модуля, тож навіть код, який імпортує `container.js` чи декоратори напряму, оминаючи `main.ts`, отримає поліфіл до того, як спрацюють його декоратори.
- **Тести компілюються через `tsc`, а не запускаються через `tsx`.** `tsx` побудований на esbuild, а esbuild не підтримує `emitDecoratorMetadata`, тож `design:paramtypes` просто не зʼявився б.

Як `resolve` проходить граф:

1. Шукає зареєстрований провайдер для токена: `useValue` повертає значення, `useClass` резолвить вказаний клас. Якщо провайдера немає, а токен — клас, резолвить сам клас.
2. Перевіряє цикл: шлях резолву — це `Set` класів, який передається рекурсивно. Якщо клас уже є у шляху, кидає помилку з усім ланцюжком: `[...path, current].join(" -> ")`. Без цієї перевірки цикл закінчився б `RangeError: Maximum call stack size exceeded`.
3. Для синглтона повертає кешований екземпляр, якщо він уже є.
4. Для кожного параметра конструктора бере токен з `@Inject`, а якщо його немає — тип з `design:paramtypes`. Далі рекурсивно резолвить кожну залежність.
5. Викликає `new Target(...deps)` і, якщо це синглтон, кладе екземпляр у кеш.

Метадані `@Injectable` і `@Inject` читаються лише з самого класу (`getOwnMetadata`), тож підклас не підхоплює їх від батька. Виняток: підклас без власного конструктора працює з конструктором батька, тому типи параметрів і токени беруться з батька.

## Помилки

| Ситуація | Повідомлення |
|---|---|
| Цикл | `Circular dependency detected: A -> B -> A` |
| Клас без `@Injectable()` | `Child is not marked as @Injectable()` |
| Інтерфейс без `@Inject` | `Cannot resolve parameter #0 of NoToken: Object is not an @Injectable() class. Use @Inject(token) for interfaces and primitives` |
| Токен без провайдера | `Cannot resolve parameter #0 of ApiClient: no provider registered for token CONFIG` |

## Тести

`test/container.test.ts`, 11 тестів на `node:test`:

- **scopes**: singleton повертає той самий екземпляр, transient — щоразу новий;
- **recursive resolve**: A → B → C, і в A лежить живий C;
- **@Inject(token)**: залежність, зареєстрована під `Symbol.for('CONFIG')`, резолвиться за токеном, хоча в `design:paramtypes` для неї лише `Object`; привʼязка інтерфейсу до реалізації через `useClass`; помилки для токена без провайдера та для інтерфейсу без `@Inject`;
- **inheritance**: підклас без `@Injectable()`, підклас із власним конструктором, підклас із конструктором батька;
- **circular dependencies**: A → B → A дає помилку з ланцюжком, а не `RangeError`.

## Структура

| Файл | Призначення |
|---|---|
| `src/decorators/injectable.ts` | декоратор `@Injectable()` |
| `src/decorators/inject.ts` | параметр-декоратор `@Inject(token)` |
| `src/container.ts` | сам контейнер: `register`, `resolve`, скоупи, детекція циклів |
| `src/tokens.ts` | токени (`CONFIG = Symbol.for("CONFIG")`) і типи `Constructor`, `InjectionToken` |
| `src/main.ts` | точка входу: `import "reflect-metadata"` і публічне API |
| `test/setup.ts` | підключає `reflect-metadata` перед тестами |
| `test/container.test.ts` | тести |
| `tsconfig.json` | `experimentalDecorators` і `emitDecoratorMetadata`; компілює `src/` і `test/` для тестів у `dist-test/` |
| `tsconfig.build.json` | збірка лише `src/` у `dist/` |
| `Dockerfile` | multi-stage: `deps` → `builder` → `runner` (prod), плюс `dev` для тестів і розробки |
| `docker-compose.yml` | сервіс `api` на стадії `runner` |
| `docker-compose.override.yml` | dev: стадія `dev`, `./src` і `./test` змонтовано лише для читання |

Обмеження: дозволено лише `reflect-metadata`. Жодних `@nestjs/*`, `inversify`, `tsyringe` чи `typedi`, контейнер написаний з нуля.
