// GitHub Pages: noma'lum yo'llar (masalan /s-lynoxdonat/orders) ham ilovani ochishi uchun
import { copyFileSync } from "node:fs";
copyFileSync("dist/index.html", "dist/404.html");
console.log("dist/404.html tayyor");
