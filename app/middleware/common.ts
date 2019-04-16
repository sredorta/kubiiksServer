import express from 'express';
import {Response,Request,NextFunction} from 'express';
//i18n part
//import { messages as en } from '../i18n/en';
import { messages as en} from '../i18n/en';
import {UniqueConstraintError, ValidationErrorItem} from 'sequelize';
import * as path from 'path';
import * as glob  from 'glob';
import { config } from 'bluebird';
import AppConfig from '../config/config.json';
import { plainToClass } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import {HttpException} from '../classes/HttpException';
import * as ts from "typescript";
import jwt from "jsonwebtoken";

export let messages = en; //Set default language and export messages


export class Middleware {
    //Handle cors for the api
    public static cors() {
        console.log("Cors enabled !!!");
        return function (req:express.Request, res:express.Response, next:express.NextFunction) {
            //Enabling CORS
            res.header("Access-Control-Allow-Origin", "*");
            res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-client-key, x-client-token, x-client-secret, Authorization");
            next();
        }
    }

    //Set language based on headers and supported languages in req.language
    public static language() {
        console.log("Language enabled !!");
        return function (req:express.Request, res:express.Response, next:express.NextFunction) {
            //Languages supported
            const acceptableLanguages = glob.sync(`${__dirname}/../i18n/*.ts`)
                    .map((file:any) => path.basename(file, '.ts'))
                    .filter((language:string) => language !== 'index');
            let language = (req.acceptsLanguages(acceptableLanguages) || AppConfig.api.defaultLanguage) as string;
            
            res.locals.language = language;  //Store language in the locals

            //Override messages so that it uses correct language
            let acc : any = [];
            acc[language] = require(`../i18n/${language}`).messages;
            messages = acc[language];
            next();
        }
    }

    public static languagesSupported() {
        return glob.sync(`${__dirname}/../i18n/*.ts`)
        .map((file:any) => path.basename(file, '.ts'))
        .filter((language:string) => language !== 'index');
    }

    //Handle all errors !
    public static errorHandler() {
        console.log("errorHandler enabled !!!");
        return function errorMiddleware(error: HttpException, request: Request, response: Response, next: NextFunction) {
            console.log("Running errorHandler !");
            console.log("//////////////////////////////////////////////");
            console.log(error);
            console.log("//////////////////////////////////////////////");

            console.log("Message: " + error.message);

            const status : number = error.status || 500;
            let message = error.message || 'Something went wrong';;
            //Override unique violation message

            async function _generateError() {
                if (error.errors)
                if (error.errors[0])
                    if (error.errors[0].type)
                        if (error.errors[0].type =="unique violation") {
                            const elem = error.errors[0].instance._modelOptions.name.singular;
                            //TODO fix this in case it doesn't exist and remove error
                            let code: string = `({
                                Run: (messages: any, elem:string): string => {
                                    return Promise.resolve(messages.validationUnique(messages[elem])); }
                                })`;
                            let result = ts.transpile(code);
                            let runnalbe :any = eval(result);
                            message = await runnalbe.Run(messages,elem);
                        }          
                response.status(status).send({
                    status:status,
                    message: message
                    });

            }
            _generateError();
        }
    }


    //Middleware that handles parameter input validation
    public static validation<T>(type: any): express.RequestHandler {
        console.log("Validation middleWare enabled !");
        return function validationMiddleware(req:Request, res:Response, next: NextFunction) {
          validate(plainToClass(type, req.body))
            .then((errors: ValidationError[]) => {
              if (errors.length > 0) {
                let message : string = "Unknown error";  
                errors.map((error: ValidationError) => {
                    //Get priority of isNotEmpty (missing parameter)
                    if (error.constraints.isNotEmpty)
                        message = error.constraints["isNotEmpty"];
                    else {
                        message = Object.values(error.constraints)[0];
                    }
                    console.log("THIS IS THE MESSAGE AFTER TAKING FIRST: " + message);
                    console.log(error.constraints);
                    console.log(Object.values(error.constraints)[0])
                    //Object.values(error.constraints[0])
                });
                next(new HttpException(400, message, errors));
              } else {
                next();
              }
            });
        };
      }


    //Checks if header contains JWT and needs to be called at each route that requires auth
    public static checkJwt() {
        return function (req:express.Request, res:express.Response, next:express.NextFunction) {
            console.log("Running checkJWT middleware");
            const token = <string>req.headers["authorization"];
            console.log("Found token : " + token);

            let jwtPayload;
            if (!token) {
                next(new HttpException(401, messages.authTokenMissing, null));
                return;
            }
            //Now check if token is valid
            //Try to validate the token and get data
            try {
                jwtPayload = <any>jwt.verify(token, AppConfig.auth.jwtSecret);
                res.locals.jwtPayload = jwtPayload;
                console.log("Stored in locals for next request:");
                console.log(jwtPayload);
            } catch (error) {
                console.log("An error happened here !!!!!");
                console.log(error);
                //If token is not valid, respond with 401 (unauthorized)
                next(new HttpException(401, messages.authTokenInvalid, null));
                //res.status(401).send(messages.authTokenInvalid);
                return;
            }      
                //The token is valid for 1 hour
                //We want to send a new token on every request
                /*const { userId, username } = jwtPayload;
                const newToken = jwt.sign({ userId, username }, config.jwtSecret, {
                    expiresIn: "1h"
                });
                res.setHeader("token", newToken); */

            next();
        }
    }      

}
