import express from 'express';
import {Response,Request,NextFunction} from 'express';
import * as multer from 'multer';
//i18n part
//import { messages as en } from '../i18n/en';
import { messages as en} from '../i18n/en';
import {UniqueConstraintError, ValidationErrorItem} from 'sequelize';
import * as path from 'path';
import * as glob  from 'glob';
import {AppConfig} from '../utils/config';
import { plainToClass } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';
import {HttpException} from '../classes/HttpException';
import * as ts from "typescript";
import jwt from "jsonwebtoken";
import {check, validationResult,body} from 'express-validator/check';
import {ValidationException} from '../classes/ValidationException';
import { User } from '../models/user';
import passportJWT from "passport-jwt";
import webPush from 'web-push';
import { url } from 'inspector';
import { objectExpression } from 'babel-types';

export let messages = en; //Set default language and export messages
export let messagesAll : string[] = [];






export class Middleware {
    //Handle cors for the api
    public static cors() {
        return function (req:express.Request, res:express.Response, next:express.NextFunction) {
            //Enabling CORS
            //res.header("Access-Control-Allow-Origin", AppConfig.api.host + ":"+ AppConfig.api.fePort);
            res.header("Access-Control-Allow-Origin", "*");

            res.header("Access-Control-Allow-Methods", "GET,HEAD,OPTIONS,POST,PUT,DELETE,UPDATE");
            res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-client-key, x-client-token, x-client-secret, Authorization, enctype");
            next();
        }
    }

    /**Sets the onPush vapid notifications details */
    public static onPush() {
        return function (req:express.Request, res:express.Response, next:express.NextFunction) {
            webPush.setVapidDetails('https://www.kubiiks.com', AppConfig.auth.onPush.public,AppConfig.auth.onPush.private);
            next();
        }
    }



    //Set language based on headers or referer because of oauth
    public static language() {
        return function (req:express.Request, res:express.Response, next:express.NextFunction) {
            console.log(req.url);
            console.log(req.headers['referer']);
            let language :string;
            //GET LANGUAGE FROM REFERER FIRST
            if (req.url.includes('/callback')) {
                language = Middleware.getFromUrl(req.headers['referer']);
            } else {
                //GET LANGUAGE FROM HEADER
                const acceptableLanguages = glob.sync(process.cwd() + '/app/i18n/*.ts')
                        .map((file:any) => path.basename(file, '.ts'))
                        .filter((language:string) => language !== 'index');
                    language = (req.acceptsLanguages(acceptableLanguages) || AppConfig.api.defaultLanguage) as string;
            }
            res.locals.language = language;  //Store language in the locals
            req.language = language;

            //Override messages so that it uses correct language
            let acc : any = [];
            acc[language] = require(`../i18n/${language}`).messages;
            messages = acc[language];
            //console.log("SETTING LANGUAGE", language);
            next();
        }
    }

    private static getFromUrl(url:string | undefined){
        if (url) {
            const found = url.match(/\/[a-z][a-z]\//g);
            if (found)
                if (found[0]) {
                    return found[0].replace(/\//gi, '');
                }
        }
        return AppConfig.api.defaultLanguage;
    }



    public static languagesSupported() {
        return glob.sync(process.cwd() + '/app/i18n/*.ts')
        .map((file:any) => path.basename(file, '.ts'))
        .filter((language:string) => language !== 'index');
    }


    //Handle all errors !
    public static errorHandler() {
        return function errorMiddleware(error: HttpException, request: Request, response: Response, next: NextFunction) {
            console.log("Running errorHandler !");
            console.log("//////////////////////////////////////////////");
            console.log(error.stack);
            console.log("//////////////////////////////////////////////");
            console.log("ERROR TYPE: " + typeof error);

            console.log("Message: " + error.message);



                const status : number = error.status || 500;
                let message = error.message || 'Something went wrong';;
                let send = false;
                if (error.errors) {
                    if (error.errors[0])
                        if (error.errors[0].type == "Validation error") {
                            message = messages.validation(error.errors[0].path);
                            response.status(status).send({
                                    status:status,
                                    message: message
                                    });
                        } else if (error.errors[0].type =="unique violation") {
                            async function _generateError() {
                                const elem = error.errors[0].instance._modelOptions.name.singular;
                                console.log("Found unique violation !!!!!");
                                console.log(elem);
                                //TODO fix this in case it doesn't exist and remove error
                                let code: string = `({
                                    Run: (messages: any, elem:string): string => {
                                        return Promise.resolve(messages.validationUnique(messages[elem])); }
                                    })`;
                                let result = ts.transpile(code);
                                let runnalbe :any = eval(result);
                                message = await runnalbe.Run(messages,elem);
                                response.status(status).send({
                                    status:status,
                                    message: message
                                    });
                            }
                            _generateError();
                        } else {
                            response.status(status).send({
                                status:status,
                                message: message
                            });             
                        } 
                } else {
                    response.status(status).send({
                        status:status,
                        message: message
                    });                  
                }        

        }
    }
    /** Middleware that handles parameter input validation using express-validation*/
    public static validate(): express.RequestHandler {
        return function (req:Request, res:Response, next: NextFunction) {
            try{  
                validationResult(req).throw();
            } catch(error) {
                next(new ValidationException(error));  
            }
            next();
        };
      }


    /**Gets logged in user without exiting so that initial data loading can work registered or not */
    public static getUserFromToken() {
        return async function (req:Request, res:Response, next: NextFunction) {
            try {
                const token = passportJWT.ExtractJwt.fromAuthHeaderWithScheme('Bearer')(req);
                if (token)
                    jwt.verify(token,AppConfig.auth.jwtSecret, (err,decoded) => {
                        if (err) {
                            req.user = undefined;
                            next();
                        } else {
                            if (typeof decoded == "object") {
                                let tmp = <any>decoded;
                                if (tmp.id) {
                                    req.user = {id:tmp.id};
                                    req.language = res.locals.language;
                                }
                            }
                            next();
                        }
                    })
                else {
                    req.user=undefined;
                    next();
                }    
            } catch(error) {
                console.log(error);
                req.user=undefined;
                next();
            }
        }
    }


    /**Checks that user has not been already logged in */
    public static unregistered() {
        return async (req:express.Request, res:express.Response, next:express.NextFunction) => {
            console.log("UNREGISTERED CHECK !!!!!!!!!!!!!!!!");
            try {
                let token  =  req.headers['authorization'];
                console.log("Token is : " + token);
                if (token == undefined) {
                    next();
                } else {
                    //Verify if token is valid
                    token = token.slice(7, token.length); //Remove Bearer from token
                    jwt.verify(token, AppConfig.auth.jwtSecret, (err, decoded) => {
                        if (err) next();
                        else throw new HttpException(400, messages.authAlreadyLoggedIn, null);
                        })
                }
            console.log("UNREGISTERED END !!!!");
            } catch(error) {
                next(error);
            }
        }
    } 

    /** Checks that the registered userhas kubiiks rights if not errors */     
    public static hasKubiiksRights() {
        return async (req:express.Request, res:express.Response, next:express.NextFunction) => {
            try {
                if(!req.user) throw new Error("User not found !");
                let myUser = await User.scope("details").findByPk(req.user.id);
                if (myUser) {
                    if (myUser.roles.findIndex(obj => obj.name == 'kubiiks') >= 0)
                        next();
                    else
                        next(new HttpException(403, messages.authTokenInvalidRole('kubiiks'), null));
                } else
                    next(new HttpException(403, messages.authTokenInvalidRole('kubiiks'), null));
            } catch(error) {
                next(new HttpException(403, messages.authTokenInvalidRole('kubiiks'), null));
            }
        }
    }

    /** Checks that the registered user is an administrator if not errors */     
    public static hasAdminRights() {
        return async (req:express.Request, res:express.Response, next:express.NextFunction) => {
            try {
                if(!req.user) throw new Error("User not found !");
                let myUser = await User.scope("details").findByPk(req.user.id);
                if (myUser) {
                    if (myUser.hasRole("admin"))
                        next();
                    else
                        next(new HttpException(403, messages.authTokenInvalidRole('admin'), null));
                } else
                    next(new HttpException(403, messages.authTokenInvalidRole('admin'), null));
            } catch(error) {
                next(new HttpException(403, messages.authTokenInvalidRole('admin'), null));
            }
        }
    }

    /** Checks that the registered user has content role or is an administrator if not errors */     
    public static hasContentRights() {
        return async (req:express.Request, res:express.Response, next:express.NextFunction) => {
            try {
                if(!req.user) throw new Error("User not found !");
                let myUser = await User.scope("details").findByPk(req.user.id);
                if (myUser) {
                    if (await myUser.hasRole("content") )
                        next();
                    else
                        next(new HttpException(403, messages.authTokenInvalidRole('content'), null));
                } else
                    next(new HttpException(403, messages.authTokenInvalidRole('content'), null));
            } catch(error) {
                next(new HttpException(403, messages.authTokenInvalidRole('content'), null));
            }
        }
    }    

    /** Checks that the registered user has email role or is an administrator if not errors */     
    public static hasEmailRights() {
        return async (req:express.Request, res:express.Response, next:express.NextFunction) => {
            try {
                if(!req.user) throw new Error("User not found !");
                let myUser = await User.scope("details").findByPk(req.user.id);
                if (myUser) {
                    if (await myUser.hasRole("email") )
                        next();
                    else
                        next(new HttpException(403, messages.authTokenInvalidRole('email'), null));
                } else
                    next(new HttpException(403, messages.authTokenInvalidRole('email'), null));
            } catch(error) {
                next(new HttpException(403, messages.authTokenInvalidRole('email'), null));
            }
        }
    }   
    /** Checks that the registered user has notification role or is an administrator if not errors */     
    public static hasNotificationRights() {
        return async (req:express.Request, res:express.Response, next:express.NextFunction) => {
            try {
                if(!req.user) throw new Error("User not found !");
                let myUser = await User.scope("details").findByPk(req.user.id);
                if (myUser) {
                    if (await myUser.hasRole("notification") )
                        next();
                    else
                        next(new HttpException(403, messages.authTokenInvalidRole('notification'), null));
                } else
                    next(new HttpException(403, messages.authTokenInvalidRole('notification'), null));
            } catch(error) {
                next(new HttpException(403, messages.authTokenInvalidRole('notification'), null));
            }
        }
    }   
    /** Checks that the registered user has stats role or is an administrator if not errors */     
    public static hasStatsRights() {
        return async (req:express.Request, res:express.Response, next:express.NextFunction) => {
            try {
                if(!req.user) throw new Error("User not found !");
                let myUser = await User.scope("details").findByPk(req.user.id);
                if (myUser) {
                    if (await myUser.hasRole("stats") )
                        next();
                    else
                        next(new HttpException(403, messages.authTokenInvalidRole('stats'), null));
                } else
                    next(new HttpException(403, messages.authTokenInvalidRole('stats'), null));
            } catch(error) {
                next(new HttpException(403, messages.authTokenInvalidRole('stats'), null));
            }
        }
    }   

    /** Checks that the registered user has content role or is an administrator if not errors */     
    public static hasBlogRights() {
        return async (req:express.Request, res:express.Response, next:express.NextFunction) => {
            try {
                if(!req.user) throw new Error("User not found !");
                let myUser = await User.scope("details").findByPk(req.user.id);
                if (myUser) {
                    if (await myUser.hasRole("blog") )
                        next();
                    else
                        next(new HttpException(403, messages.authTokenInvalidRole('blog'), null));
                } else
                    next(new HttpException(403, messages.authTokenInvalidRole('blog'), null));
            } catch(error) {
                next(new HttpException(403, messages.authTokenInvalidRole('blog'), null));
            }
        }
    }       

    /** Checks that the registered user has 'users role or is an administrator if not errors */     
    public static hasUsersRights() {
        return async (req:express.Request, res:express.Response, next:express.NextFunction) => {
            try {
                if(!req.user) throw new Error("User not found !");
                let myUser = await User.scope("details").findByPk(req.user.id);
                if (myUser) {
                    if (await myUser.hasRole("users") )
                        next();
                    else
                        next(new HttpException(403, messages.authTokenInvalidRole('users'), null));
                } else
                    next(new HttpException(403, messages.authTokenInvalidRole('users'), null));
            } catch(error) {
                next(new HttpException(403, messages.authTokenInvalidRole('users'), null));
            }
        }
    }    

    public static catchFacebookResponse() {
        return function (req:express.Request, res:express.Response, next:express.NextFunction) {
            console.log("CATCHFACEBOOKRESPONSE !!!!!!!!!!!!");
            next();
        }
    }


}
