'use strict';

const fs = require('fs');
const request = require('request');
const cheerio = require('cheerio');
const Promise = require('bluebird');
const progressbar = require('progressbar');

const packageParser = {};
/**
* packageParser is the parent for all of our internal package.json parsing
* Pretty much everything is private to the function itself
* To call it, use something like:
* packageParser.matchDependencies('./test/fixtures/package-test.json').then((p) => console.log(p));
* @private
**/

const progress = progressbar.create().step('Pleating');

packageParser.dependencies = function dependencies(path_to_pkg) {
  /**
  * Load a package.json file
  * @param path_to_pkg {string} The path, from root of application (_not_ from this module) to the package.json to load
  * @returns {array} An array of all modules in the dependencies and the devDependencies
  * @private
  **/
  const pj = JSON.parse(fs.readFileSync(path_to_pkg, 'utf8'));
  let deps = Object.keys(pj.dependencies).concat(Object.keys(pj.devDependencies));
  progress.setTotal((deps.length) + 3); // 3 is how many steps we do beyond grabbing dependencies
  return deps;
}

packageParser.depURL = function depURL(pkg) {
  /**
  * Given a package name, get the npmjs url to that package
  * @param pkg {string} The package name, as seen in package.json
  * @returns {string} A fully-qualified URL to the package
  * @private
  **/
  return `https://www.npmjs.com/package/${pkg}`;
}

packageParser.fetchPromise = function fetchPromise(depURL, callback) {
  /**
  * Given a package url, fetch that url and do the callback to it
  * This will usually be called using fetchNPM.
  * @param depurl {string} A fully-qualified URL to the package
  * @param callback {Function} A callback that takes one parameter.
  * This callback will only be called if the URL is successfully gotten
  * @returns {Function} A Promise
  * @private
  **/
  return new Promise( (resolve, reject) => {
    request(depURL, (error, response, content) => {
      resolve(callback(content));
      reject(error);
    });
  });
}

packageParser.fetchNPM = function fetchNPM(depURL) {
  /**
  * Given a package url, fetch that url and get the dependencies
  * Call this instead of fetchPromise.
  * @param depurl {string} A fully-qualified URL to the package
  * @returns {Function} A resolved or rejected Promise
  * @private
  **/
  return this.fetchPromise(depURL, (p) => this.parseDependencies(p));
}

packageParser.parseDependencies = function parseDependencies(html) {
  /**
  * Takes the html content of an NPM module's page and parses out the keywords
  * Typically this is called when request returns a given NPM page
  * @param {string} The HTML content of the page
  * @returns {Function} A resolved or rejected Promise
  * @private
  **/
  let $ = cheerio.load(html);
  let deps = $('.sidebar>p.list-of-links:first-of-type').text().split(',');
  return deps.map((el) => {
    return el.replace(/\s*(\S.*\S)\s*/g, '$1');
  });
}

packageParser.parseDockers = function parseDockers(dockerJSON) {
  /**
  * Docker makes all the official repos available in a JSON file at one endpoint
  * URL: https://hub.docker.com/v2/repositories/library/
  * JSON from here comes in the format:
  *  {
  *   user: "library",
  *   name: "nginx",
  *   namespace: "library",
  *   status: 1,
  *   description: "Official build of Nginx.",
  *   is_private: false,
  *   is_automated: false,
  *   can_edit: false,
  *   star_count: 3054,
  *   pull_count: 196962844,
  *   last_updated: "2016-05-24T23:08:09.477673Z"
  * },
  * Grab that JSON and parse it into an easy-to-search object of the format:
  * {
  *   nginx: "Official build of Nginx."
  * }
  * @param dockerJSON {string} Stringified JSON from the Docker endpoint
  * @returns {Object} An object of Dockerfiles with the format:
  * { technol}
  * @private
  **/
  let dj = JSON.parse(dockerJSON);
  let dockers = {};
  dj.results.forEach((el) => {
    dockers[el.name] = el.description;
  });
  return dockers;
}

packageParser.fetchDockers = function fetchDockers(url) {
  /**
  * Grabs all Official Docker repositories
  * @param {string} A URL, but usually we won't need this and will use the default
  * @returns {Function} A resolved or rejected Promise
  * @private
  **/
  const dockerURL = url || 'https://hub.docker.com/v2/repositories/library/?page_size=999';
  return this.fetchPromise(dockerURL, (p) => this.parseDockers(p));
}

packageParser.matchDependencies = function matchDependencies(path_to_pkg) {
  /**
  * Given a package, return an object with the docker modules needed to launch
  * that package. This method pulls together all other methods in this object.
  * Response is an object that shows the docker module.
  * Example response:
  *   {  mongo : true,
  *   redis: true, }
  * @param {string} The path, from root of application (_not_ from this module) to the package.json to load
  * @returns {Object} An object describing all of the needed docker modules
  **/

  let packageURLs = this.dependencies(path_to_pkg).map((pkg) => {
    return this.depURL(pkg);
  });

  let depPromises = [];
  let depKeywords = [];
  // Drop our output in an object so that we can later see
  //  if an individual module is in that list
  let depList = {};

  let dockerPromises = this.fetchDockers();
  progress.addTick();

  // We now have an array of NPM URLs
  // We need to iterate over the array
  packageURLs.forEach(url => {
    // And for each URL, grab a Promise of the fetch & parse
    // Drop that in an array
    depPromises.push(this.fetchNPM(url));
  });

  // console.log(depPromises);

  // Get a returnable Promise
  return Promise.all(depPromises)
    .then((r) => {
      // As each individual npm page fetch completes,
      progress.addTick();
      Promise.each(depPromises, (promiseList) => {
        progress.addTick();
        // Get the keywords and add to an array of keywords
        depKeywords = depKeywords.concat(promiseList);
      });
    }).then(() => {
      // When all npm page fetch-and-parses have resolved
      dockerPromises.then(data => {
        console.log('dk', depKeywords);
        progress.addTick();
        depKeywords.forEach(kw => {
          // For each keyword from an npm page
          if (!depList.hasOwnProperty(kw) && data.hasOwnProperty(kw)) {
            // If there's not a key in depList with that name
            // And if there's a matching Docker module
            // Add a key
            depList[kw] = true;
          }
        });
        // console.log('dl', depList);
        progress.finish();
      });
    }).then(() => depList);
}

packageParser.matchDependencies('./test/fixtures/package-test.json').then((p) => console.log(p));

module.exports = packageParser;
