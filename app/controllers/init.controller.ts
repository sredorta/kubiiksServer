import {Request, Response, NextFunction, RequestHandler} from 'express'; 
import {HttpException} from '../classes/HttpException';
import { Middleware } from '../middleware/common';
import { CustomValidators } from '../classes/CustomValidators';
import sequelize from 'sequelize';
import nodemailer from 'nodemailer';
import {body} from 'express-validator/check';

import {AppConfig} from '../utils/config';
import {messages} from '../middleware/common';
import { Article } from '../models/article';
import { ArticleTranslation } from '../models/article_translation';
import { User } from '../models/user';
import { Setting } from '../models/setting';
import { Page } from '../models/page';



export class InitController {



    constructor() {}

    /**Gets all data required for app initialization in one shot */
    static getFull = async (req: Request, res: Response, next:NextFunction) => {
        try {
            let result : any = {};
            let settings = await Setting.findAll();
            let pages = await Page.findAll();
            //We need to get user as it is used when we change language and alerts need translation
            let myUser = null;
            if (req.user && req.user.id) {
                myUser = await User.scope("details").findByPk(req.user.id);
            }
            if (settings) 
                result["settings"] = [];
            for (let setting of settings) {
                    result["settings"].push(setting.sanitize(res.locals.language))
            }
            let articles = await Article.findAll({order: [sequelize.literal('id DESC')]});
            result["articles"] = [];
            for (let article of articles) 
                result["articles"].push(article.sanitize(res.locals.language));
            result["pages"] = [];
            for (let page of pages) 
             result["pages"].push(page.sanitize(res.locals.language));  
             if (myUser) result["user"] = myUser.sanitize(res.locals.language);
            res.json(result);
        } catch(error) {
            next(error);
        }
    }

    /**Gets all data required for app initialization in one shot */
    static get = async (req: Request, res: Response, next:NextFunction) => {
        try {
            let result : any = {};
            let settings = await Setting.findAll();
            let pages = await Page.findAll({where:{page:req.body.page}});
            if (settings) 
                result["settings"] = [];
            for (let setting of settings) {
                    result["settings"].push(setting.sanitize(res.locals.language))
            }
            //We need to add all articles of the page, which means all articles with implicit page equal to req.body.page
            //And all articles from cathegories that the page owns
            let articles = await Article.findAll({where:{page:req.body.page},order: [sequelize.literal('id DESC')]});
            for (let page of pages) {
                for (let cath of page.cathegories) {
                    let tArticles = await Article.findAll({where:{cathegory:cath.name},order: [sequelize.literal('id DESC')],limit:cath.initalCount})
                    for (let tArticle of tArticles) {
                        articles.push(tArticle);
                    }
                }
            }
            //Get articles that are required in all pages first
            let articlesAll = await Article.findAll({where:{page:"all"},order: [sequelize.literal('id DESC')]});
            for (let tArticle of articlesAll) {
                articles.push(tArticle);
            }
            //Add article if articleId was asked
            if (req.body.articleId>0) {
                let tmp = await Article.findOne({where:{id:req.body.articleId}})
                if (tmp) articles.push(tmp);
            }
            result["articles"] = [];
            for (let article of articles) 
                result["articles"].push(article.sanitize(res.locals.language));
            result["pages"] = [];
            for (let page of pages) 
             result["pages"].push(page.sanitize(res.locals.language));  
            res.json(result);
        } catch(error) {
            next(error);
        }
    }
    /** Role attach parameter validation */
    static checks() {
            return [
                body('page').exists().withMessage('exists'),
                body('articleId').exists().withMessage('exists').isNumeric(),
                Middleware.validate()
            ]
    }   
}
