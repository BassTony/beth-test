import { Elysia, t, ws } from "elysia";
import { html } from "@elysiajs/html";
import * as elements from "typed-html";
import { db } from "./db";
import { Todo, todos, Message as ChatMessage, messages } from "./db/schema";
import { desc, eq } from "drizzle-orm";
import { ElysiaWS, ElysiaWSContext, WSTypedSchema } from "elysia/ws";

let lastID = 5;

let wss: ElysiaWS<ElysiaWSContext<WSTypedSchema<never>, {}, "/chatupdate">>[] = [];

const formatDate = (dateString: Date) => {
  const options: any = { year: "numeric", month: "short", day: "numeric", hour12: false };
  return new Date(dateString).toLocaleTimeString(undefined, options);
};
const app = new Elysia()
  .use(ws())
  .ws('/chatupdate', {
    body: t.Object({
      "ws-message": t.String({ minLength: 1 }),
      nick: t.String(),
      HEADERS: t.Object({}),
    }),
    open(ws) {
      console.log("*******.ws({ open() })");
      console.log(ws);
      wss.push(ws);
      db.select().from(messages).orderBy(desc(messages.time)).all().then((msgs) => {
        ws.send(
          <div id="chat_messages" class="h-80 overflow-auto flex flex-col-reverse">
            {msgs.map((msg) => {
              return (
                <ChatMessageItem msg={msg} />
              );
            }
            )}
          </div>
        );
      });
    },
    message(ws, message) {
      console.log("*******.ws({ message() })");

      const wsReceivedMsg = {
        nick: message.nick,
        message: message["ws-message"],
      };

      db.insert(messages).values(wsReceivedMsg).returning().get().then(newMsg => {
        return (<ChatMessageItem msg={newMsg} />);
      });

      const nick: string = message['nick'];
      const msg: string = message['ws-message'];
      console.log(msg);
      wss.forEach(socket => {
        socket.send(
          <div id="chat_messages" hx-swap-oob="afterbegin">
            <p><b>{nick}</b> {msg}</p>
          </div>
        );
      });
    },
    close(ws, code, message) {
      console.log("*******.ws({ close() })");
      wss = wss.filter(s => ws.raw.data.id != s.raw.data.id);
      console.log("remaining websockets in array:", wss.length)
    },
  })
  .use(html())
  .get("/", ({ html }) =>
    html(
      <BaseHtml>
        <body
          class="flex-col w-full h-screen justify-center items-center"
        >
          <div id="chat-app"
            class="flex w-full h-auto justify-center items-center border-4 p-4"
            hx-get="/chat"
            hx-trigger="load"
            hx-swap="innerHTML"
          />

          {/* <ChatList chatMessages={messages} msgLimit={10} />
            <EnterChatForm msgLimit={10} /> */}
          {/* class="flex-col w-full h-auto justify-center items-center border-4 p-4">
            <p>here you can leave a message</p>
            <div class="flex-col"><ChatList chatMessages={messages} /></div> */}
          <div id="todo-app"
            class="flex w-full h-auto justify-center items-center border-4 p-4"
            hx-get="/todos"
            hx-trigger="load"
            hx-swap="innerHTML"
          />
        </body>
        {/* <button hx-post="/clicked" hx-swap="outerHTML">
            klikkaa mua
          </button> */}
        {/* </body> */}
      </BaseHtml>
    ))
  .post("/clicked", () => <div class="text-blue-600">I'm from the werver!</div>)
  .post("/todos/toggle/:id",
    async ({ params }) => {
      const oldTodo = await db
        .select()
        .from(todos)
        .where(eq(todos.id, params.id))
        .get();
      const newTodo = await db
        .update(todos)
        .set({ completed: !oldTodo.completed })
        .where(eq(todos.id, params.id))
        .returning()
        .get();
      return <TodoItem{...newTodo} />;

      /* const todo = db.find((todo) => todo.id === params.id);
      if (todo) {
        todo.completed = !todo.completed;
        return <TodoItem {...todo} />;
      } */
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
    }
  )
  .get("/chat", async () => {
    const data = await db.select().from(messages).all();
    return (// <TodoList todos={data} />;
      <Chat assignedNick={""} />
    );
  })
  .get("/todos", async () => {
    const data = await db.select().from(todos).all();
    return <TodoList todos={data} />;
  })
  .get("/messages",
    async () => {
      let lim = 10;
      const data = (await db.select().from(messages).orderBy(desc(messages.time)).limit(lim).all()).reverse();
      return <ChatList chatMessages={data} />;
    }/* ,
    {
      params: t.Object({
        lim: t.Numeric(),
      })
    } */
  )
  // .get("/messages/:lim",
  //   async ({ params }) => {
  //     let lim = params.lim || 10;
  //     const data = await db.select().from(messages).limit(lim).all();
  //     return <ChatList chatMessages={data} />;
  //   },
  //   {
  //     params: t.Object({
  //       lim: t.Numeric(),
  //     })
  //   }
  // )
  .delete("/todos/:id",
    async ({ params }) => {
      await db.delete(todos).where(eq(todos.id, params.id)).run();
    },
    {
      params: t.Object({
        id: t.Numeric(),
      }),
    }

    /*       const todo = db.find((todo) => todo.id === Number(params.id));
          if (todo) {
            db.splice(db.indexOf(todo), 1);
          }
        } */
  )
  .post("/todos",
    async ({ body }) => {
      if (body.content.length === 0) {
        throw new Error("Content cannot be empty");
      }
      const newTodo = await db.insert(todos).values(body).returning().get();
      return <TodoItem {...newTodo} />;
    },
    {
      body: t.Object({
        content: t.String(),
      }),
    }
  )
  .post("/get-nick",
    // requests a nickname and returns a unique nickname (not used yet) and a chat form to be used with it
    // roadmap: 1. get same form back with error if nickname already used 2. save nickname to localStorage 3. tokenize nickname in db to prevent tampering with localStorage
    async ({ body }) => {
      if (body.requestedNick.length === 0) {
        throw new Error("Content cannot be empty");
      }
      const nicks = (await db.select({ nick: messages.nick }).from(messages).all()).map(n => n.nick);
      // body.requestedNick; // data.length === 0
      // const nicks = msgs.map(m => m.nick);
      const newNick =
        nicks.includes(body.requestedNick)
          ? body.requestedNick + '_' + Math.floor(Math.random() * 100000)
          : body.requestedNick;
      // ? body.requestedNick // await db.get(chatMessages).values(body).all().get();
      // : "DUPLICATE_NICKNAME";
      return (
        <div>
          <Chat assignedNick={newNick} /> {/* TODO how many messages are loaded? */}
        </div>
      );
    },
    {
      body: t.Object({
        requestedNick: t.String(),
      }),
    }
  )
  .post("/new-message",
    // requests a nickname and returns a unique nickname (not used yet) and a chat form to be used with it
    // roadmap: 1. get same form back with error if nickname already used 2. save nickname to localStorage 3. tokenize nickname in db to prevent tampering with localStorage
    async ({ body }) => {
      if (body.message.length === 0) {
        throw new Error("Content cannot be empty");
        // console.log("MOIKKA")
      }
      const newMsg = await db.insert(messages).values(body).returning().get();

      const msgs = (await db.select().from(messages).orderBy(desc(messages.time)).limit(10).all()).reverse();
      // const newNick = "MATTI"; // data.length === 0
      // ? body.requestedNick // await db.get(chatMessages).values(body).all().get();
      // : "DUPLICATE_NICKNAME";
      // messages = [...messages, { id, nick: body.nick, message: body.message }];
      // const msgs = await db.select().from(messages).all();

      // console.log(messages)
      return (
        // <ChatItem {...newMsg} />
        <ChatList chatMessages={msgs} />
      );
    },
    {
      body: t.Object({
        nick: t.String(),
        message: t.String(),
      }),
    }
  )
  .listen(3000);

console.log(`Elysia running! At: http://${app.server?.hostname}:${app.server?.port}`);

const BaseHtml = ({ children }: elements.Children) => `
<!DOCTYPE html>
<html lang="en">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tony's BETH STACK</title>
  <script src="https://unpkg.com/htmx.org@1.9.3"></script>
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://unpkg.com/hyperscript.org@0.9.9"></script>
  <script src="https://unpkg.com/htmx.org/dist/ext/ws.js"></script>
</head>

${children}
`;

/* type Todo = {
  id: number;
  content: string;
  completed: boolean;
};

const db: Todo[] = [
  { id: 1, content: "osta maitoa", completed: true },
  { id: 2, content: "kupit piim", completed: false },
];
 */
function TodoItem({ content, completed, id }: Todo) {
  return (
    <div id={`todo-item-${id}`} class="flex flex-row space-x-3">
      <p>{content}</p>
      <input
        type="checkbox"
        checked={completed}
        hx-post={`/todos/toggle/${id}`}
        hx-target="closest div"
        hx-swap="outerHTML"
      />
      <button
        class="text-red-500"
        hx-delete={`/todos/${id}`}
        hx-target="closest div"
        hx-swap="outerHTML"
      >X</button>
    </div>
  );
}

function TodoList({ todos }: { todos: Todo[]; }) {
  return (
    <div id="todo-list-dbg">
      {todos.map((todo) => (
        <TodoItem {...todo} />
      ))}
      <TodoForm />
    </div>
  );
}

function TodoForm() {
  return (
    <form id="todo-form-dbg"
      class="flex flex-row space-x-3"
      hx-post="/todos"
      hx-swap="beforebegin"
      _="on submit target.reset()"
    >
      <input type="text" name="content" class="border border-black" />
      <button type="submit">Add</button>
    </form>
  );
}

function Chat({ assignedNick }: { assignedNick: String; }) {
  if (assignedNick === "") {
    return (
      <div id="chat-dbg">
        <div id="chat-list-container"
          hx-get="/messages"
          hx-swap="outerHTML"
          // hx-target="beforebegin"
          hx-trigger="load"
        >
          <div><h4>loading…</h4></div>
          {/* <ChatList chatMessages={messages} /> */}
        </div>
        <EnterChatForm msgLimit={10} />
      </div>
    );
  } else {
    {/* <div id="chat-list-container"
        hx-get="/messages"
        hx-swap="innerHTML"
        // hx-target="innerHTML"
        hx-trigger="every 2s"
      >
        <div><h4>loading…</h4></div>
      </div> */}
    return (
      <div id="chat-dbg" hx-ext="ws" ws-connect="/chatupdate" >
        <div id="notifications"></div>
        <div id="chat_messages" class="h-80 overflow-auto flex flex-col-reverse">
          ...
        </div>
        <ChatForm nickname={assignedNick} />
      </div>
    );
    {/* <ChatForm newNick={assignedNick}/> */ }
  }
}

function ChatItem({ nick, message, id, time }: ChatMessage) {
  return (
    <div id={`${id}`} class="flex flex-row space-x-3">
      <p><i>{nick}:</i> <b>{message}</b> (${time}) </p>
      {/* <input
        type="checkbox"
        checked={false}
        hx-post={`/todos/toggle/${id}`}
        hx-target="closest div"
        hx-swap="outerHTML"
      />
      <button
        class="text-red-500"
        hx-delete={`/todos/${id}`}
        hx-swap="outerHTML"
        hx-target="closest div"
      >X</button> */}
    </div>
  );
}

function ChatList({ chatMessages }: { chatMessages: ChatMessage[]; }) {
  return (
    <div id="chat-list-inner">
      {chatMessages.map((chatMessage) => (
        <ChatItem {...chatMessage} />
      ))}
    </div>
  );
}

function ChatForm({ nickname }: { nickname: String; }) {
  return (
    /*     <form id="ws-form" ws-send>
          <input name="ws-message" type="text" />
          <input type="submit" />
        </form>
     */
    <form id="chat-form"
      ws-send
      class="flex flex-row space-x-3"
      // hx-post="/new-message"
      // hx-swap="none"
      // hx-swap="outerHTML"
      // hx-target="#chat-list-inner"
      _="on submit target.reset()"
    >
      <input type="text" hidden="true" name="nick" value={nickname + ""} class="border border-black" />
      <i>{nickname}:</i><input type="text" name="ws-message" class="border border-black" />
      <button type="submit">Send Message</button>
    </form>
  );
}

function EnterChatForm() {
  return (
    <form id="chat-form"
      class="flex flex-row space-x-3"
      hx-post="/get-nick"
      hx-target="#chat-app"
      _="on submit target.reset()"
    >
      <input type="text" name="requestedNick" class="border border-black rounded-s-md" />
      <button type="submit">request nickname</button>
    </form>
  );
}

function ChatMessageItem({ msg }: { msg: { time: Date, id: number, nick: string, message: string; }; }) {
  return (
    <p id="{`message-${id}`}"><b>{msg.nick}</b> {msg.message} <span style="font-size: 0.3rem">{formatDate(msg.time)}</span></p>
  );
}
