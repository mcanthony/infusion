/*global jQuery, fluid, jqUnit*/

(function ($) {
    $(function () {
        var demoUploadTests = new jqUnit.TestCase("DemoUploadManager Tests");
        
        // Test files.
        var file1 = {
            id: 0,
            size: 400000,
            filestatus: SWFUpload.FILE_STATUS.QUEUED
        };
               
        var file2 = {
            id: 1,
            size: 600000,
            filestatus: SWFUpload.FILE_STATUS.QUEUED
        };
                
        var file3 =  {
            id: 2,
            size: 800000,
            filestatus: SWFUpload.FILE_STATUS.QUEUED
        };
        
        var file_smallerThanChunkSize =  {
            id: 3,
            size: 165432,
            filestatus: SWFUpload.FILE_STATUS.QUEUED
        };
        
        var file_largerAndNotMultipleOfChunkSize =  {
            id: 4,
            size: 812345,
            filestatus: SWFUpload.FILE_STATUS.QUEUED
        };

        
        var events = {};
        fluid.mergeListeners(events, fluid.defaults("fluid.uploader").events);
        
        // Silly little data structure for capturing the sequence and parameters of the upload flow.
        var eventTracker = function () {
            var emptyFunction = function () {};
            
            var listeners = {
                onUploadStart: emptyFunction,
                onFileStart: emptyFunction,
                onFileProgress: emptyFunction,
                onFileSuccess: emptyFunction,
                afterFileComplete: emptyFunction,
                afterUploadComplete: emptyFunction
            };
            
            var tracker = jqUnit.invocationTracker();
            tracker.interceptAll(listeners);
            tracker.listeners = listeners;
            
            return tracker;
        };
        
        var uploadFiles = function (files) {      
            var tracker = eventTracker();
            
            var demoManager = fluid.demoUploadManager(events, {
                simulateDelay: false,
                listeners: tracker.listeners
            });
            
            // Just upload one file.
            demoManager.queue.files = files;
            demoManager.start();
            
            tracker.transcript.files = files;
            
            return tracker.transcript;    
        };
        
        var uploadFirstFile = function () {
            return uploadFiles([file1]);
        };
        
        var uploadAllFiles = function () {
            return uploadFiles([file1, file2, file3]);
        };
        
        var uploadSmallFile = function () {
            return uploadFiles([file_smallerThanChunkSize]);
        };
        
        var uploadNotMultipleFile = function () {
            return uploadFiles([file_largerAndNotMultipleOfChunkSize]);
        };
        
        demoUploadTests.test("Options merging", function () {
            // Test with no events and no additional options. simulateDelay should be true.
            var demoManager = fluid.demoUploadManager(events);
            
            // Ensure our default options are cool.
            jqUnit.assertTrue("simulateDelay should default to true.", demoManager.options.simulateDelay);
            jqUnit.assertEquals("We should have inherited our parent's default options.",
                                "../../swfupload/swfupload_f9.swf",
                                demoManager.options.flashURL);
                                
            // Test an alternative option. simulateDelay should be false.
            demoManager = fluid.demoUploadManager(events, {
                simulateDelay: false
            });
            jqUnit.assertFalse("simulateDelay should be false.", demoManager.options.simulateDelay);
        });
        
        var checkEventSequenceForFile = function (transcript, file) {
            // Check that each event corresponds to the specified file.
            for (var i = 0; i < transcript.length; i++) {
                jqUnit.assertEquals("In each event callback, the file id should be 0.",
                                    file.id, transcript[i].args[0].id);
            }
            
            // Then check the file sequence.
            var lastEvent = transcript.length - 1;
            jqUnit.assertEquals("We should get onFileStart first.",
                                "onFileStart", transcript[0].name);    
            jqUnit.assertEquals("The second to last event should be onFileSuccess.",
                                "onFileSuccess", transcript[lastEvent - 1].name);      
            jqUnit.assertEquals("And the last event should be afterFileComplete.",
                                "afterFileComplete", transcript[lastEvent].name);
            for (i = 1; i < lastEvent - 1; i++) {
                jqUnit.assertEquals("Then an onFileProgress.",
                                    "onFileProgress", transcript[i].name);      
            }   
        };
        
        demoUploadTests.test("Simulated upload flow: sequence of events.", function () {
            // Test with just one file.
            var transcript = uploadFirstFile();
            jqUnit.assertEquals("We should have received seven upload events.", 7, transcript.length);
            
            jqUnit.assertEquals("The first event of a batch should be onUploadStart.",
                                "onUploadStart", transcript[0].name);
            jqUnit.assertDeepEq("The argument to onUploadStart should be an array containing the current batch.",
                                transcript.files, transcript[0].args[0]);
                                
            checkEventSequenceForFile(transcript.slice(1, transcript.length - 1), file1);
            jqUnit.assertEquals("The last event of a batch should be afterUploadComplete.",
                         "afterUploadComplete", transcript[transcript.length - 1].name);
            jqUnit.assertDeepEq("The argument to afterUploadComplete should be an array containing the current batch.",
                                transcript.files, transcript[transcript.length - 1].args[0]);
        });
        
    
        demoUploadTests.test("Simulated upload flow: sequence of events for multiple files.", function () {
            // Upload three files.
            var transcript = uploadAllFiles();
            jqUnit.assertEquals("We should have received twenty upload events.", 20, transcript.length);
            jqUnit.assertEquals("The first event of a batch should be onUploadStart.",
                                "onUploadStart", transcript[0].name);
            jqUnit.assertDeepEq("The argument to onUploadStart should be an array containing the current batch.",
                                transcript.files, transcript[0].args[0]);
            
            // The first file is 400000 bytes, so it should have 2 progress events, for a total of 5 events.
            checkEventSequenceForFile(transcript.slice(1, 6), file1);
            
            // The second file is 600000 bytes, so it should have 3 progress events, for a total of 6 events.
            checkEventSequenceForFile(transcript.slice(6, 12), file2);
            
            // The second file is 800000 bytes, so it should have 4 progress events, for a total of 7 events.
            checkEventSequenceForFile(transcript.slice(12, 19), file3);
            
            jqUnit.assertEquals("The last event of a batch should be afterUploadComplete.",
                                "afterUploadComplete", transcript[transcript.length - 1].name);
            jqUnit.assertDeepEq("The argument to afterUploadComplete should be an array containing the current batch.",
                                transcript.files, transcript[transcript.length - 1].args[0]);
        });
        
        demoUploadTests.test("Simulated upload flow: onFileProgress data.", function () {
            var transcript = uploadFirstFile();
            
            // Check that we're getting valid progress data for the onFileProgress events.
            jqUnit.assertEquals("The first onFileProgress event should have 200000 bytes complete.",
                                200000, transcript[2].args[1]);
            jqUnit.assertEquals("The first onFileProgress event should have 400000 bytes in total.",
                                400000, transcript[2].args[2]);                    
            jqUnit.assertEquals("The first onFileProgress event should have 400000 bytes complete.",
                                400000, transcript[3].args[1]);
            jqUnit.assertEquals("The first onFileProgress event should have 400000 bytes in total.",
                                400000, transcript[3].args[2]);
        });
    
        demoUploadTests.test("Chunking test: smaller files don't get reported larger because of demo file chunking.", function () {
            var transcript = uploadSmallFile();
            
            // Check that we're getting valid progress data for the onFileProgress events.
            jqUnit.assertEquals("The only onFileProgress event should have 165432 bytes complete.",
                                165432, transcript[2].args[1]);
            jqUnit.assertEquals("The only onFileProgress event should have 165432 bytes in total.",
                                165432, transcript[2].args[2]);
            jqUnit.assertNotEquals("There is only one onFileProgress event in the transcript.",
                                   "onFileProgress", transcript[3].name);              
         });

        demoUploadTests.test("Chunking test: files that are not a multiple of the chunk size don't get reported larger because of the chunking.", function () {
            var transcript = uploadNotMultipleFile();
            
            // Check that we're getting valid progress data for the onFileProgress events.
            jqUnit.assertEquals("The first onFileProgress event should have 200000 bytes complete.",
                                200000, transcript[2].args[1]);
            jqUnit.assertEquals("The second onFileProgress event should have 200000 more bytes complete.",
                                400000, transcript[3].args[1]);                    
            jqUnit.assertEquals("The third onFileProgress event should have 200000 more bytes complete.",
                                600000, transcript[4].args[1]);                    
            jqUnit.assertEquals("The fourth onFileProgress event should have 200000 more bytes complete.",
                                800000, transcript[5].args[1]);                    
            jqUnit.assertEquals("The last onFileProgress event should have 12345 more bytes complete.",
                                812345, transcript[6].args[1]);                    
        });

    });
})(jQuery);