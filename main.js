const debug = require('debug')('logSorter');
const LineByLineReader = require('line-by-line');
const fs = require('fs');
const moment = require('moment');
const EventEmitter = require('events');
const INPUT_FILES_COUNT = 10;

/**
 * Class to create one output file (output/merged.log) containing all the entries of log files (logs/*.logs) sorted by date and time.
 * @assumption Input log files are named as 1.log, 2.log...10.log
 * @returns {Promise}
 */
const logSorter = function() {
    let lineReaders = []; //cache of line readers for each file
    let currentlyProcessedLogLines = []; //aux storage for in memory logs being processed

    //custom events emitter
    class LogSorterInternalEvents extends EventEmitter {}
    const logSorterInternalEvents = new LogSorterInternalEvents();

    //save reference to itself
    const self = this;

    //write stream for output log file
    //and in addition with streams we ensure the order
    const writeStream = fs.createWriteStream("./output/merged.log");

    return new Promise( (resolve, reject) => {

        //iterate on each log and setup line readers
        for (let i = 0; i < INPUT_FILES_COUNT; i++) {
            lineReaders.push({
                lr: new LineByLineReader('./logs/' + (i + 1) + '.log'), //save line reader object
                exhausted: false //save whether this file has been exhausted
            });

            //add handler for the `line read` event
            lineReaders[i].lr.on('line', function (line) {
                //push a line to currentlyProcessedLogLines cache
                currentlyProcessedLogLines.push({
                    index: i, //this helps to keep track which file this line came from
                    line: line, //actual log line
                    datetime: moment(line.slice(0, 32)) //separate date - Assumption it's initial 32 chars
                });

                debug('Paused file ' + i);
                //pause after pushing each line because we want to control the flow
                lineReaders[i].lr.pause();

                //emit line pushed event
                logSorterInternalEvents.emit('linePushed');
            });

            //add handler for the `lines exhausted in file` event
            lineReaders[i].lr.on('end', function () {
                debug("Exhausted  file " + i);
                //set exhausted flag
                lineReaders[i].exhausted = true;

                //emit a file exhausted event
                logSorterInternalEvents.emit('fileExhausted')
            });

            //add handler for the `error in line reader` event
            lineReaders[i].lr.on('error', function (err) {
                reject(err);
                return;
            });
        }

        /**
         * Method to find out when one line from each file is pushed in to currentlyProcessedLogLines cache
         * @returns {Promise}
         */
        const initialLogLinesReady =  function () {
            return new Promise((resolve, reject) => {
                logSorterInternalEvents.on('linePushed', () => {
                    if (currentlyProcessedLogLines.length === INPUT_FILES_COUNT) {
                        resolve();
                    }
                });
            })
        };

        /**
         * Method to find out when all lines from all the files have been read
         * @returns {Promise}
         */
        const allFilesExhausted = function () {
            return new Promise((resolve, reject) => {
                //whenever a file is exhausted we check if all files are exhausted
                logSorterInternalEvents.on('fileExhausted', () => {

                    const allExhausted = lineReaders.reduce(function (accumulator, currentValue) {
                        return accumulator && currentValue.exhausted;
                    }, true);

                    if (allExhausted) {
                        resolve();
                    }
                })
            })
        };

        //Handle error in output write stream
        writeStream.on('error', (err) => {
            reject(err);
        });

        /**
         * Helper method to process currentlyProcessedLogLines cache once
         */
        const triggerNextProcessingCycle = function () {
            //find the earliest date in currentlyProcessedLogLines cache
            let earliest = self.smallestDate(currentlyProcessedLogLines);

            //write earliest dated log line to output stream
            //delete this item from currentlyProcessedLogLines cache
            //pull a new element for currentlyProcessedLogLines cache from the file whose item we just deleted
            if (earliest) {
                writeStream.write(earliest.line + '\r\n');
                currentlyProcessedLogLines = self.findAndDelete(earliest, currentlyProcessedLogLines);
                debug('resuming ' + earliest.index);
                lineReaders[earliest.index].lr.resume();
            }
        };

        //as soon initial lines (first line from each file) are pushed in currentlyProcessedLogLines cache
        //we wait for other events that can trigger a processing cycle
        initialLogLinesReady().then(() => {
            //new line pushed
            logSorterInternalEvents.on('linePushed', () => {
                triggerNextProcessingCycle();
            });
            //a file exhausted (this would indirectly suppress new line pushed event)
            logSorterInternalEvents.on('fileExhausted', () => {
                triggerNextProcessingCycle();
            });

            //manually trigger once to cause the chain of events
            triggerNextProcessingCycle();
        });

        //when all files are written we formally exit from here
        allFilesExhausted().then(() => {
            debug("all files exhausted");
            writeStream.end();
            resolve();
        })
    })
};

logSorter.prototype = {
    /**
     * Helper to find the smallest date in Array of log lines
     * @param logLines - Array of log lines
     * @returns {*}
     */
    smallestDate: function (logLines) {
        if (logLines.length === 0) return null;
        return logLines.reduce(function (a, b) {
            //return smallest date
            let smallest;
            if(a.datetime.isAfter(b.datetime)){
                smallest = b;
            }else if(a.datetime.isBefore(b.datetime)){
                smallest = a;
            }else if(a.index < b.index){
                //if two dates are same return the one with smallest index/filename to make logs predictable
                smallest = a;
            }else{
                smallest = b;
            }
            return smallest;
        });
    },

    /**
     * Helper to remove an element from logLines array (shallow lookup)
     * @param element - element to be removed
     * @param logLines - Array of log lines
     * @returns {Array.<T>|*}
     */
    findAndDelete: function (element, logLines) {
        let newLogLinesArray = logLines.filter(function (a) {
            return a !== element
        });
        return newLogLinesArray;
    }
};

module.exports = logSorter;
