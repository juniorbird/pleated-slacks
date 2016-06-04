'use strict';

import fs from 'fs';
import request from 'request';
import cheerio from 'cheerio';
import Promise from 'bluebird';

const ERR_URL = 'Couldn\'t complete URL request';
const ERR_URL_PARSE = 'Couldn\'t load or parse data on this module from npmjs.com';

const fetchURL = (url)  => {
  /**
  * Given a url, fetch that url
  * @param depurl {string} A fully-qualified URL
  * This callback will only be called if the URL is successfully gotten
  * If the request fails, this will throw an error
  * @returns {string} the esponse content
  * @private
  **/
  return request(depURL, (error, response, content) => {
    if (error) {
      throw new Error(`${ERR_URL} ${err}`);
    } else {
      return content;
    }
  }
};


export const packageParser = {};
/**
* packageParser is the parent for all of our internal package.json parsing
* Pretty much everything is private to the function itself
* To call it, use something like:
* packageParser.matchDependencies('./test/fixtures/package-test.json').then((p) => console.log(p));
* @private
**/

packageParser.dependencies = path_to_pkg => {
  /**
  * Load a package.json file
  * @param path_to_pkg {string} The path, from root of application (_not_ from this module) to the package.json to load
  * @returns {array} An array of all modules in the dependencies and the devDependencies
  * @private
  **/
  const pj = JSON.parse(fs.readFileSync(path_to_pkg, 'utf8'));
  return Object.keys(pj.dependencies).concat(Object.keys(pj.devDependencies));
};

packageParser.depURL = pkg => {
  /**
  * Given a package name, get the npmjs url to that package
  * @param pkg {string} The package name, as seen in package.json
  * @returns {string} A fully-qualified URL to the package
  * @private
  **/
  return `https://www.npmjs.com/package/${pkg}`;
};

async packageParser.fetchNPM = depURL => {
  /**
  * Given a package url, fetch that url and get the dependencies
  * Call this instead of fetchPromise.
  * @param depurl {string} A fully-qualified URL to the package
  * @returns {Function} A Promise resolving to the parsed HTML of the page
  * @private
  **/
  try {
    let html = await request(depURL);
    return packageParser.parseDependencies(html);
  } catch(err) {
    throw new Error(`${ERR_URL_PARSE} ${err}`);
  }
};

packageParser.parseDependencies = html => {
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
};

packageParser.parseDockers = dockerJSON => {
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

async packageParser.fetchDockers = url => {
  /**
  * Grabs all Official Docker repositories
  * @param {string} A URL, but usually we won't need this and will use the default
  * @returns {Function} A Promise resolving to the parsed list of official Dockerfiles
  * @private
  **/
  const dockerURL = url || 'https://hub.docker.com/v2/repositories/library/?page_size=999';

  try {
    let dockers = await request(dockerURL);
    return packageParser.parseDockers(dockers);
  } catch(err) {
    throw new Error(`${ERR_URL_PARSE} ${err}`);
  }
};

async packageParser.matchDependencies = path_to_pkg => {
  /**
  * Given a package, return an object with the docker modules needed to launch
  * that package. This method pulls together all other methods in this object.
  * Response is an array that shows the docker modules needed.
  * Example response:
  *   [mongo, redis]
  * @param {string} The path, from root of application (_not_ from this module) to the package.json to load
  * @returns {Object} An object describing all of the needed docker modules
  **/
  const packageJSON = this.dependencies(path_to_pkg);

  let packageURLs = packageJSON.map((pkg) => {
    return this.depURL(pkg);
  });

  let depPromises = [];
  let depKeywords = [];
  // Drop our output in an array so that we can later see
  //  if an individual module is in that list
  let depList = {};

  // We now have an array of NPM URLs
  // We need to iterate over the array
  packageURLs.forEach(url => {
    // And for each URL, grab a Promise of the fetch & parse
    // Drop that in an array
    depPromises.push(this.fetchNPM(url));
  });

  try {
    const dockerPromises = await this.fetchDockers();
  } catch(err) {
    throw new Error(`${ERR_URL_PARSE} ${err}`);
  }

  try {
    // Get a returnable Promise
    return await Promise.all(depPromises)
      .then(() => {
        // As each individual npm page fetch completes,
        Promise.each(depPromises, (promiseList) => {
          // Get the keywords and add to an array of keywords
          depKeywords = depKeywords.concat(promiseList);
        });
      }).then(() => {
        // When all npm page fetch-and-parses have resolved
        dockerPromises.then(data => {
          depKeywords.forEach(kw => {
            // For each keyword from an npm page
            if (!depList.hasOwnProperty(kw) && data.hasOwnProperty(kw)) {
              // If there's not a key in depList with that name
              // And if there's a matching Docker module
              // Add a key
              depList[kw] = true;
            }
          });
        });
      }).then(() => Object.keys(depList));
  } catch(err) {
    throw new Error(`${ERR_URL_PARSE} ${err}`);
  }
};
