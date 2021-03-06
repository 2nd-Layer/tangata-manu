// flow-typed signature: 9979d82c5535d942428f24331deb550d
// flow-typed version: 8a44adac37/cron_v1.x.x/flow_>=v0.57.3

declare module 'cron' {

    declare class CronTime {
        /**
         * Create a new ```CronTime```.
         * @param source The time to fire off your job. This can be in the form of cron syntax or a JS ```Date``` object.
         * @param zone Timezone name. You can check all timezones available at [Moment Timezone Website](http://momentjs.com/timezone/).
         */
        constructor(source: string | Date, zone?: string): CronTime;

        /**
         * Tells you when ```CronTime``` will be run.
         * @param i Indicate which turn of run after now. If not given return next run time.
         */
        sendAt(i?: number): Date;
        /**
         * Get the number of milliseconds in the future at which to fire our callbacks.
         */
        getTimeout(): number;
    }

    declare type CronJobParameters = {
        /**
         * The time to fire off your job. This can be in the form of cron syntax or a JS ```Date``` object.
         */
        cronTime: string | Date;
        /**
         * The function to fire at the specified time.
         */
        onTick: () => void;
        /**
         * A function that will fire when the job is complete, when it is stopped.
         */
        onComplete?: () => void;
        /**
         * Specifies whether to start the job just before exiting the constructor. By default this is set to false. If left at default you will need to call ```job.start()``` in order to start the job (assuming ```job``` is the variable you set the cronjob to). This does not immediately fire your onTick function, it just gives you more control over the behavior of your jobs.
         */
        start?: boolean;
        /**
         * Specify the timezone for the execution. This will modify the actual time relative to your timezone. If the timezone is invalid, an error is thrown. You can check all timezones available at [Moment Timezone Website](http://momentjs.com/timezone/).
         */
        timeZone?: string;
        /**
         * The context within which to execute the onTick method. This defaults to the cronjob itself allowing you to call ```this.stop()```. However, if you change this you'll have access to the functions and values within your context object.
         */
        context?: any;
        /**
         * This will immediately fire your ```onTick``` function as soon as the requisit initialization has happened. This option is set to ```false``` by default for backwards compatibility.
         */
        runOnInit?: boolean;
    }

    declare class CronJob {
        /**
         * Return ```true``` if job is running.
         */
        running: boolean | void;
        /**
         * Function using to fire ```onTick```, default set to an inner private function. Overwrite this only if you have a really good reason to do so.
         */
        fireOnTick: Function;

        /**
         * Create a new ```CronJob```.
         * @param cronTime The time to fire off your job. This can be in the form of cron syntax or a JS ```Date``` object.
         * @param onTick The function to fire at the specified time.
         * @param onComplete A function that will fire when the job is complete, when it is stopped.
         * @param start Specifies whether to start the job just before exiting the constructor. By default this is set to false. If left at default you will need to call ```job.start()``` in order to start the job (assuming ```job``` is the variable you set the cronjob to). This does not immediately fire your onTick function, it just gives you more control over the behavior of your jobs.
         * @param timeZone Specify the timezone for the execution. This will modify the actual time relative to your timezone. If the timezone is invalid, an error is thrown. You can check all timezones available at [Moment Timezone Website](http://momentjs.com/timezone/).
         * @param context The context within which to execute the onTick method. This defaults to the cronjob itself allowing you to call ```this.stop()```. However, if you change this you'll have access to the functions and values within your context object.
         * @param runOnInit This will immediately fire your ```onTick``` function as soon as the requisit initialization has happened. This option is set to ```false``` by default for backwards compatibility.
         */
        constructor(cronTime: string | Date, onTick: () => void, onComplete?: () => void, start?: boolean, timeZone?: string, context?: any, runOnInit?: boolean): CronJob;
        /**
         * Create a new ```CronJob```.
         * @param options Job parameters.
         */
        constructor(options: CronJobParameters): CronJob;

        /**
         * Runs your job.
         */
        start(): void;
        /**
         * Stops your job.
         */
        stop(): void;
        /**
         * Change the time for the ```CronJob```.
         * @param time Target time.
         */
        setTime(time: CronTime): void;
        /**
         * Tells you the last execution date.
         */
        lastDate(): Date;
        /**
         * Tells you when a ```CronTime``` will be run.
         * @param i Indicate which turn of run after now. If not given return next run time.
         */
        nextDates(i?: number): Date;
        /**
         * Add another ```onTick``` function.
         * @param callback Target function.
         */
        addCallback(callback: Function): void;
    }

    declare var job:
        ((cronTime: string | Date, onTick: () => void, onComplete?: () => void, start?: boolean, timeZone?: string, context?: any, runOnInit?: boolean) => CronJob)
        | ((options: CronJobParameters) => CronJob);
    declare var time: (source: string | Date, zone?: string) => CronTime;
    declare var sendAt: (cronTime: CronTime) => Date;
    declare var timeout: (cronTime: CronTime) => number;

}
