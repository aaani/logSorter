const logSorter = require("../main");
const expect = require("chai").expect;
const fs = require("fs");
const moment = require("moment");
const exec = require('child_process').exec;
let myLogSorter;

describe("logSorter", (done) => {
    before(() => {
        myLogSorter = new logSorter();
    });

    it("is defined", () => {
        expect(logSorter).to.exist
    });

    it("output file has the same number of lines as the total lines in all input files", (done) => {
        myLogSorter
            .then(() => {
                //$ wc -l < ./output/merged.log | xargs echo -n gives us total number of lines
                exec('wc -l < ./output/merged.log | xargs echo -n', function (error, results) {
                    expect(results).to.equal('44');
                    done();
                });
            })
            .catch((error) => {
                done(error);
            });
    });

    it("output file lines are sorted by date", (done) => {
        myLogSorter
            .then(() => {
                //read output file synchronously
                const mergedLogs = fs.readFileSync("./output/merged.log", "utf8");
                //get each non empty line
                const mergedLogsLines = mergedLogs.split("\r\n").filter( (line) => { return line.trim().length > 0});
                //get timestamp from each line
                const logLineTimestamps = mergedLogsLines.map( (line) => { return line.slice(0, 32);});

                //iterate on each line and make sure timestamp in each line is either larger or same as previous
                let sorted = true;
                for(let i=1; i<logLineTimestamps.length; i++){
                    let prevTimestamp = moment(logLineTimestamps[i-1]);
                    let currTimestamp = moment(logLineTimestamps[i]);
                    if(prevTimestamp.isAfter(currTimestamp)){
                        sorted = false;
                    }
                }

                expect(sorted).to.be.true;

                done();
            })
            .catch((error) => {
                done(error);
            });
    });

    it("output is deterministic", (done) => {
        const expectedOutput = fs.readFileSync("./tests/fixtures/merged.log", "utf8");
        myLogSorter
            .then(() => {
                //read output file synchronously
                const mergedLogs = fs.readFileSync("./output/merged.log", "utf8");
                expect(mergedLogs).to.equal(expectedOutput);
                done()
            })
            .catch((error) => {
                done(error);
            });
    })
});
