import type { BookmarkNode } from "../types";

const link = (id: string, title: string, url: string): BookmarkNode => ({ id, title, url });
const folder = (id: string, title: string, children: BookmarkNode[]): BookmarkNode => ({ id, title, children });

export const demoTree: BookmarkNode[] = [{
  id: "0",
  title: "root",
  children: [
    folder("1", "书签栏", [
      link("101", "Figma", "https://figma.com"),
      link("102", "GitHub", "https://github.com"),
      link("103", "Notion", "https://notion.so"),
      folder("110", "设计与灵感", [
        link("111", "Mobbin", "https://mobbin.com"),
        link("112", "Awwwards", "https://awwwards.com"),
        folder("113", "字体与排版", [
          link("114", "Google Fonts", "https://fonts.google.com"),
          link("115", "Typewolf", "https://typewolf.com"),
          folder("116", "中文字体", [
            link("117", "字由", "https://hellofont.cn"),
            link("118", "霞鹜文楷", "https://github.com/lxgw/LxgwWenKai"),
          ]),
        ]),
        link("119", "Pinterest", "https://pinterest.com"),
      ]),
      folder("120", "开发工具", [
        link("121", "React", "https://react.dev"),
        link("122", "TypeScript", "https://typescriptlang.org"),
        link("123", "Vite", "https://vite.dev"),
        folder("124", "文档", [
          link("125", "MDN Web Docs", "https://developer.mozilla.org"),
          link("126", "Chrome Extensions", "https://developer.chrome.com/docs/extensions"),
        ]),
      ]),
      folder("130", "今日工作", [
        link("131", "项目看板", "https://linear.app"),
        link("132", "团队文档", "https://notion.so"),
        link("133", "代码仓库", "https://github.com"),
        link("134", "邮箱", "https://mail.google.com"),
      ]),
      folder("140", "阅读清单", [
        link("141", "少数派", "https://sspai.com"),
        link("142", "Hacker News", "https://news.ycombinator.com"),
        link("143", "阮一峰的网络日志", "https://ruanyifeng.com"),
      ]),
    ]),
    folder("2", "其他书签", [
      link("201", "OpenAI", "https://openai.com"),
      folder("210", "生活", [
        link("211", "地图", "https://maps.google.com"),
        link("212", "天气", "https://weather.com"),
      ]),
    ]),
    folder("3", "移动设备书签", []),
  ],
}];
