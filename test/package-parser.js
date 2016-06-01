'use strict';

const expect = require('expect');
const fs = require('fs');
const sinon = require('sinon');

// File we're testing
const parser = require('../lib/package-parser.js')

// Load fixtures
const targetDeps = ['mongoose',
  'redis',
  'express',
  'q',
  'sequelize',
  'ghost',
  'cradle',
  'node-solr-smart-client',
  'expect',
  'mocha',
  'consul'
];
const targetKeywords = ['object relational mapper', 'nodejs', 'orm', 'mssql', 'postgres', 'postgresql', 'sqlite', 'mysql'];
const targetDocker = {
  busybox: 'Busybox base image.',
  mongo: 'MongoDB document databases provide high availability and easy scalability.',
  mysql: 'MySQL is a widely used, open-source relational database management system (RDBMS).',
  nginx: 'Official build of Nginx.',
  node: 'Node.js is a JavaScript-based platform for server-side and networking applications.',
  postgres: 'The PostgreSQL object-relational database system provides reliability and data integrity.',
  redis: 'Redis is an open source key-value store that functions as a data structure server.',
  registry: 'Containerized docker registry',
  swarm: 'Swarm: a Docker-native clustering system.',
  ubuntu: 'Ubuntu is a Debian-based Linux operating system based on free software.'
};
const targetFinal = { redis: true,
  node: true,
  postgres: true,
  mysql: true,
  ghost: true,
  couchdb: true,
  solr: true,
  consul: true
};

const sampleNPM = fs.readFileSync('./test/fixtures/npm-test.html', 'utf8');
const sampleDocker = fs.readFileSync('./test/fixtures/docker-test.json', 'utf8');
const pjDeps = parser.dependencies('./test/fixtures/package-test.json');

// Now do the tests
describe('package.json parser', () => {
  // Check that we read all of the packages from package.json (#5)
  it('should grab a list of all packages', () => {
      expect(pjDeps).toBeAn(Array);
      expect(pjDeps.length).toEqual(targetDeps.length);
      expect(pjDeps).toEqual(targetDeps);
  });
  it('should generate package URLs', () => {
      // Do we get proper urls? (#5)
      let npmURL;
      for (let dep of targetDeps) {
          expect(parser.depURL(dep)).toEqual(`https://www.npmjs.com/package/${dep}`);
      }
  });
});
describe('npmjs.com fetcher', () => {
  it('should parse a sample npmjs.com page', () => {
    // Can we parse a page on NPM? (#6)
    // Hey! This one is synchronous!
    expect(parser.parseDependencies(sampleNPM)).toEqual(targetKeywords);
  });
  it('should fetch and parse an acutal npmjs.com page', function() {
    // Do we load a page on npm? (#6)
    // Use the function () format so that we can pass "this"
    // Set a long timeout so that we can waaaait for third-party data
    this.timeout(6000);
    return parser.fetchNPM('https://www.npmjs.com/package/sequelize')
        .then((result) => {
            expect(result).toEqual(targetKeywords);
        });
  });
});

describe('docker fetcher', () => {
  it('should parse sample JSON from the Docker endpoint', () => {
    // Do we convert the official repos list we get into something useful? (#1)
    expect(parser.parseDockers(sampleDocker)).toEqual(targetDocker);
  });
  it('should fetch and parse actual JSON from the Docker endpoint', function() {
    // Do we pull in official repos? (#1)
    // Use the function () format so that we can pass "this"
    // Set a long timeout so that we can waaaait for third-party data
    this.timeout(6000);
    return parser.fetchDockers('https://hub.docker.com/v2/repositories/library/?page_size=10')
        .then((result) => {
            expect(result).toEqual(targetDocker);
        });
  });
});
describe('npm/docker matcher', function () {
  let stubDockerRepos;
  let stubDependencies;
  let stubNPM;

  before(() => {
    // stub out parser.fetchDockers so we don't do a fetch to get
    // all official Docker repos
    stubDockerRepos = sinon.stub(parser, 'fetchDockers').returns(Promise.resolve(targetDocker));

    // stub out parser.dependencies so we have known dependencies
    stubDependencies = sinon.stub(parser, 'dependencies').returns(pjDeps);

    // stub out parser.fetchNPM so that we can have a known list of keywords
    //  n.b. fetchNPM fetches and parses, so output is the keywords
    stubNPM = sinon.stub(parser, 'fetchNPM').returns(Promise.resolve(targetKeywords));
  });

  it('should return the expected list of Docker repos, given a standard input', function (done) {
    this.timeout(60000);
    parser.matchDependencies('./test/fixtures/package-test.json')
      .then(function (data) {
        console.log('out', data);
        expect(data).toEqual(targetFinal);
        done();
    });
  });

  // after(() => {
  //     // un-stub
  //     // parser.fetchDockers.restore();
  //     // parser.dependencies.restore();
  //     // parser.fetchNPM.restore();
  // });

  /*
  return parser.matchDependencies('./test/fixtures/package-test.json')
      .then(function (result) {
          console.log('result',result);
          expect(result).toEqual(targetFinal);
      });
      */
});

// Check that we grab all of the official repos from Docker (#1)
/*
We should match repos for:
- mongo
- redis
- express
- mySQL
- postgres
- ghost
- solr
- consul
- couchDB
*/


// Check that output is a list of all packages with official repos (#4)
/* Output format example:
  {  mongo : [mongo, mongoose],
  redis: [redis], }
*/
