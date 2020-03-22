import {Request, Response, NextFunction} from 'express'; 
import {Setting} from '../models/setting';
import {HttpException} from '../classes/HttpException';
import {messages} from '../middleware/common';
import sequelize from 'sequelize';

import { Middleware } from '../middleware/common';
import nodemailer from 'nodemailer';
import {AppConfig} from '../utils/config';
import {body} from 'express-validator/check';
import { CustomValidators } from '../classes/CustomValidators';
import { User } from '../models/user';
import { SettingTranslation } from '../models/setting_translation';
import pug from 'pug';
import path from 'path';
import { Article } from '../models/article';
import htmlToText from 'html-to-text';
import InlineCss from 'inline-css';
import { IsPhoneNumber } from 'class-validator';
import { Email } from '../models/email';
import { EmailTranslation } from '../models/email_translation';
import { Table } from 'sequelize-typescript';
import { Helper } from '../classes/Helper';
import { Newsletter } from '../models/newsletter';

export class EmailController {
    /**Email transporter check */
    public static emailCheck = async (req: Request, res: Response, next:NextFunction) => {
        const transporter = nodemailer.createTransport(AppConfig.emailSmtp);
        let myResult = {
            host: AppConfig.emailSmtp.host,
            port: AppConfig.emailSmtp.port,
            secure: AppConfig.emailSmtp.secure,
            sender: AppConfig.emailSmtp.sender,
            verification: ""
        }
        transporter.verify(function(error, success) {
            if (error) 
                 myResult.verification = "error";
            else 
                myResult.verification = "success";
            res.send(myResult);
         });
    }

    /**Gets all email templates */
    public static getAll = async (req: Request, res: Response, next:NextFunction) => {
        try {
            if (!req.user) throw new Error("User not found");
            let result = [];
            let emails = await Email.findAll({order: [sequelize.literal('id DESC')]});
            let myUser = await User.scope("details").findByPk(req.user.id);
            //Only show protected emails if kubiiks role exists
            if (myUser) {
                if (!myUser.hasRole("kubiiks")){
                    emails = emails.filter(obj => obj.isProtected == false);
                }
            } else {
                emails = emails.filter(obj => obj.isProtected == false);
            }
            for (let article of emails) result.push(article.sanitize(res.locals.language));
            res.json(result);
        } catch(error) {
            next(error);
        }
    }


    /**Updates email template */
    static update = async (req: Request, res: Response, next:NextFunction) => {
        try {
            let myEmail = Email.build(req.body.email, {
                isNewRecord: false,
                include: [EmailTranslation]
             });
             if (!myEmail) throw new HttpException(500, messages.validationDBMissing('email'),null);           
             let myTrans = await EmailTranslation.findOne({where:{emailId:myEmail.id,iso:res.locals.language}});
             if (!myTrans) throw new Error("Translation not found !!");
             myTrans.data = req.body.email.data;
            await myTrans.save();

            await myEmail.save();
            let result = await Email.findByPk(myEmail.id);
            if (!result) throw new Error("Could not generate result !");
            res.json(result.sanitize(res.locals.language));
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static updateChecks() {
        return [
            body('email').exists().withMessage('exists'),
            body('email.id').exists().withMessage('exists').custom(CustomValidators.dBExists(Email,'id')),
            body('email.data').exists().withMessage('exists'),
            Middleware.validate()
        ]
    }  

    /**Creates email template based on reference. Admin or content required */
    static create = async (req: Request, res: Response, next:NextFunction) => {
        try {
            let myReferenceEmail = await Email.findOne({where:{name:"reference"}});
            if (!myReferenceEmail) 
                return next(new HttpException(500, "Reference email not found", null));
            //Update the name
            let myRef =  JSON.parse(JSON.stringify(myReferenceEmail));
            delete myRef.id;
            delete myRef.createdAt;
            delete myRef.updatedAt;
            myRef.isProtected = false;
            myRef.name = req.body.name;
            let myNewEmail = await Email.create(myRef);
            for (let trans of myReferenceEmail.translations) {
                let myTrans = JSON.parse(JSON.stringify(trans));
                delete myTrans.id;
                myTrans.emailId = myNewEmail.id;
                myTrans.description = req.body.description;
                await EmailTranslation.create(myTrans)
            }
            let result = await Email.findByPk(myNewEmail.id);
            if (!result) return next(new HttpException(500, "Result not found", null));
            res.json(result.sanitize(res.locals.language));                
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static createChecks() {
        return [
            body('name').exists().withMessage('exists').isLength({min:5}),
            body('name').exists().withMessage('exists').custom(CustomValidators.dBMissing(Email,'name')),
            body('description').exists().withMessage('exists').isLength({min:5,max:200}),
            Middleware.validate()
        ]
    }

    /**Deletes email template by id with all translations. Admin or content required */
    static delete = async (req: Request, res: Response, next:NextFunction) => {
        try {
            let email = await Email.findByPk(req.body.id);
            if (!email) 
                return next(new HttpException(500, "Email template could not be found", null));
            if (email.isProtected == true)
                return next(new HttpException(400, messages.emailDeleteProtected, null));
            await email.destroy();
            res.send({message: "success"}); 
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static deleteChecks() {
        return [
            body('id').exists().withMessage('exists').custom(CustomValidators.dBExists(Email,'id')),
            Middleware.validate()
        ]
    }    

    /**Returns the html of the current email*/
    public static preview = async (req: Request, res: Response, next:NextFunction) => {
        try {
            let myEmail = await Email.findByPk(req.body.email.id);
            if (!myEmail) throw new HttpException(500, messages.validationDBMissing('email'),null); 
            //Create translation[0] with current data
            let myTrans = myEmail.translations.find(obj=>obj.iso == res.locals.language);
            if (!myTrans) throw new Error("Translation not found !");  
            let result = await myEmail.getHtml(myTrans);
            res.json(result);
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static previewChecks() {
        return [
            body('email.id').exists().withMessage('exists').custom(CustomValidators.dBExists(Email,'id')),
            Middleware.validate()
        ]
    }    

  

    /**Sends email to logged in user for testing*/
    static sendTest = async (req: Request, res: Response, next:NextFunction) => {
        //TODO: Get post parameter of template email, additionalHTML
        try {
            if (!req.user) throw new Error("User not found !");
            let myUser = await User.findByPk(req.user.id);
            if (!myUser) return next(new HttpException(500, messages.validationDBMissing('user'),null));
            let myEmail = await Email.findByPk(req.body.email.id);
            if (!myEmail) throw new HttpException(500, messages.validationDBMissing('email'),null); 
            //Create translation[0] with current data
            let myTrans = myEmail.translations.find(obj=>obj.iso == res.locals.language);
            if (!myTrans) throw new Error("Translation not found !");  
            let html = await myEmail.getHtml(myTrans);
            if (!html)  return next(new HttpException(500, messages.emailSentError,null));
            const transporter = nodemailer.createTransport(AppConfig.emailSmtp);
            let myEmailT = {
                            from: AppConfig.emailSmtp.sender,
                            to: myUser.email,
                            subject: "TEST EMAIL",
                            text: htmlToText.fromString(html),
                            html: html
            }
            await transporter.sendMail(myEmailT);
            res.send({message: {show:true, text:messages.emailSentOk(myUser.email)}});  
        } catch (error) {
            next(new HttpException(500, messages.emailSentError,null));
        }
    }
   /**Parameter validation */
   static sendTestChecks() {
        return [
            body('email').exists().withMessage('exists'),
            body('email.id').exists().withMessage('exists').custom(CustomValidators.dBExists(Email,'id')),
            //TODO: Add here all required checks !!!
            Middleware.validate()
        ]
    }    


    /**Sends email to the required recipients and the additionalHTML and template*/
    static send = async (req: Request, res: Response, next:NextFunction) => {
        //TODO: Get post parameter of template email, additionalHTML
        try {
            
            let myUser = await User.findByPk(req.user.id);
            if (!myUser) return next(new HttpException(500, messages.validationDBMissing('user'),null));
            let myEmail = Email.build(req.body.email, {
                isNewRecord: false,
                include: [EmailTranslation]
             });
            if (!myEmail) return next(new HttpException(500, messages.emailSentError,null));

            let html = await myEmail.getHtml(res.locals.language, '<p> -- TEST EMAIL -- </p>');
            if (!html)  return next(new HttpException(500, messages.emailSentError,null));
            const transporter = nodemailer.createTransport(AppConfig.emailSmtp);
            let myEmailT = {
                            from: AppConfig.emailSmtp.sender,
                            to: req.body.to,
                            subject: req.body.subject,
                            text: htmlToText.fromString(html),
                            html: html
            }
            await transporter.sendMail(myEmailT);
            res.send({message: {show:true, text:messages.emailSentOk(myUser.email)}});  
        } catch (error) {
            next(new HttpException(500, messages.emailSentError,null));

        }
    }
   /**Parameter validation */
   static sendChecks() {
        return [
            body('to').exists().withMessage('exists').isArray(),
            body('to.*').isEmail(),
            body('subject').exists().withMessage('exists').not().isEmpty(),


            body('email.id').exists().withMessage('exists').custom(CustomValidators.dBExists(Email,'id')),
            body('email.translations').exists().withMessage('exists'),
            //TODO: Add here all required checks !!!
            Middleware.validate()
        ]
    }    



    /**Sends email to one email recipient using a specific template*/
    static sendTo = async (req: Request, res: Response, next:NextFunction) => {
        //TODO: Get post parameter of template email, additionalHTML
        try {
            let myEmail = await Email.findByPk(req.body.email.id);
            if (!myEmail) return next(new HttpException(500, messages.emailSentError,null));
            let html = await myEmail.getHtml(res.locals.language, req.body.additionalHtml);
            if (!html)  return next(new HttpException(500, messages.emailSentError,null));
            let header = await myEmail.getHeader(res.locals.language);

            const transporter = nodemailer.createTransport(AppConfig.emailSmtp);
            let myEmailT = {
                            from: AppConfig.emailSmtp.sender,
                            to: req.body.to,
                            subject: htmlToText.fromString(header, {uppercaseHeadings:false}),
                            text: htmlToText.fromString(html),
                            html: html
            }
            await transporter.sendMail(myEmailT);
            res.send({message: {show:true, text:messages.emailSentOk(req.body.to)}}); 
        } catch (error) {
            next(new HttpException(500, messages.emailSentError,null));
        }
    }
   /**Parameter validation */
   static sendToChecks() {
        return [
            body('to').exists().withMessage('exists').isEmail(),
            body('email.id').exists().withMessage('exists').custom(CustomValidators.dBExists(Email,'id')),
            Middleware.validate()
        ]
    }    

    

    /**Sends email to all registered users to the newsletter using a specific template*/
    static sendToAll = async (req: Request, res: Response, next:NextFunction) => {
        //TODO: Get post parameter of template email, additionalHTML
        try {
            
            let myEmail = await Email.findByPk(req.body.email.id);
            if (!myEmail) return next(new HttpException(500, messages.emailSentError,null));
            const transporter = nodemailer.createTransport(AppConfig.emailSmtp);
            let users = await Newsletter.findAll();
            for (let user of users) {
                let html = await myEmail.getHtml(user.language);
                if (!html)  return next(new HttpException(500, messages.emailSentError,null));
                let header = await myEmail.getHeader(user.language);
                let myEmailT = {
                                from: AppConfig.emailSmtp.sender,
                                to: user.email,
                                subject: htmlToText.fromString(header, {uppercaseHeadings:false}),
                                text: htmlToText.fromString(html),
                                html: html
                }
                await transporter.sendMail(myEmailT);
            }

            res.send({message: {show:true, text:messages.emailSentOkAll(users.length.toString())}}); 
        } catch (error) {
            next(new HttpException(500, messages.emailSentError,null));

        }
    }
   /**Parameter validation */
   static sendToAllChecks() {
        return [
            body('email.id').exists().withMessage('exists').custom(CustomValidators.dBExists(Email,'id')),
            //TODO: Add here all required checks !!!
            Middleware.validate()
        ]
    }    







}