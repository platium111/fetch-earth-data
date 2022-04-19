const express = require("express");
var cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const axiosRetry = require("axios-retry");

axiosRetry(axios, {
  retries: 3, // number of retries
  retryDelay: (retryCount) => {
    console.log(`retry attempt: ${retryCount}`);
    return retryCount * 2000; // time interval between retries
  },
  retryCondition: (error) => {
    // if retry condition is not specified, by default idempotent requests are retried
    return error.response.status === 503;
  },
});
// const allLinkJson = require("../dist/allLink.json");
const ProgressBar = require("progress");

const app = express();
const router = express.Router();
require("dotenv").config();

app.use(cors());

// 1. Yeu cau lan 1
// file | https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/61/MOD04_3K/2021/001/MOD04_3K.A2021001.0040.061.2021268052025.hdf
// 001 | https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/61/MOD04_3K/2021/001.json
// all 2021 | https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/61/MOD04_3K/2021.json

// 2. Yeu cau lan 2: Loc file dua tren pattern
// all 2021 | https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/5000/VNP46A2/2021.json
// 001 | https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/5000/VNP46A2/2021/001.json

const ALL_FOLDER_URL =
  "https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/5000/VNP46A2/2021.json";

const CHILD_FOLDER_URL = "https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/5000/VNP46A2/2021"
const FILTER_PATTERN = ['h20v03', 'h20v04', 'h21v03', 'h21v04'];

const dowloadEachFolder = async (folder) => {
  const filesUrl = await axios.get(
    `${CHILD_FOLDER_URL}/${folder.name}.json`
  );

  const numberOfDownload = FILTER_PATTERN.length > 0 ? filesUrl.data.map((item) => item.name).filter(name => FILTER_PATTERN.some(pattern => name.includes(pattern))).length : filesUrl.data.length;
  console.log(
    `Downloaded each folder ${folder.name} with ${numberOfDownload} files \n`
  );

  fs.writeFileSync(`./dist/${folder.name}.json`, JSON.stringify(filesUrl.data));
  const transformFiles = filesUrl.data.map((item) => item.name);
  const filterFiles = FILTER_PATTERN.length > 0 ? transformFiles.filter(name => FILTER_PATTERN.some(pattern => name.includes(pattern))) : transformFiles

  const linkObj = { folderName: folder.name, fileNames: filterFiles };
  const fullUrls = linkObj.fileNames.map((fileName) => ({
    link: `${CHILD_FOLDER_URL}/${linkObj.folderName}/${fileName}`,
    fileName,
    folderName: folder.name,
  }));

  await downloadAllFiles(fullUrls);
};

const processAllFolder = async (folders) => {
  const dir = `./dist`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  const results = [];
  for (const [i, val] of folders.entries()) {
    console.log("Download folder ", i + 1);
    // Skip tu folder 1 -> 11 thi i tu 0 -> 10
    if (i >= 0 && i <= 10) continue;
    results.push(await dowloadEachFolder(val));
  }
  return results;
};

const downloadEachFile = async (downloadItem, index) => {
  console.log("Downloading file ", index + 1);

  let { data, headers } = await axios.get(downloadItem.link, {
    headers: {
      Authorization: `Bearer ${process.env.TOKEN}`,
    },
    responseType: "stream",
  });

  const totalLength = headers["content-length"];
  const progressBar = new ProgressBar(
    `-> downloading ${downloadItem.fileName} [:bar] :percent :etas`,
    {
      width: 20,
      complete: "=",
      incomplete: " ",
      renderThrottle: 1000,
      total: parseInt(totalLength),
    }
  );
  data.on("data", (chunk) => {
    progressBar.tick(chunk.length);
    const logDownload = `${downloadItem.fileName} % completed ${parseFloat(
      (progressBar.curr / totalLength) * 100
    ).toFixed(2)} \n`;

    fs.appendFile(`./data/logfile.txt`, logDownload, (err) => {
      if (err) {
        console.error(`Error writing file ${downloadItem.fileName}`);
        return;
      }
    });
  });
  const dir = `./data/${downloadItem.folderName}`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  data.pipe(
    fs.createWriteStream(
      `./data/${downloadItem.folderName}/${downloadItem.fileName}`
    )
  );
};

const downloadAllFiles = async (links) => {
  const dir = `./data`;
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir);
  }
  const results = [];
  for (const [i, val] of links.entries()) {
    results.push(await downloadEachFile(val, i));
  }
  return results;
};

router.get("/download", async (req, res) => {
  const { query } = req;

  // get all folder 2021
  const folderResult = await axios.get(ALL_FOLDER_URL);
  const folderWithFilesArr = await processAllFolder(folderResult.data);

  // Gop lai tat ca cac link roi download
  // const arrayOfLink = folderWithFilesArr.reduce((accum, item) => {
  //   const fullUrls = item.fileNames.map((fileName) => ({
  //     link: `https://ladsweb.modaps.eosdis.nasa.gov/archive/allData/61/MOD04_3K/2021/${item.folderName}/${fileName}`,
  //     fileName,
  //   }));
  //   return [...accum, ...fullUrls];
  // }, []);
  // // save all link to file
  // fs.writeFileSync(`./dist/allLink.json`, JSON.stringify(arrayOfLink));

  // await downloadAllFiles(arrayOfLink);

  res.send("ALL DONE");
});

app.use("/", router);

app.listen(8001);
console.log("Web Server is listening at port " + 8001);
