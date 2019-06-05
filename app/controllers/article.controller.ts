import {Request, Response, NextFunction, RequestHandler} from 'express'; 
import {HttpException} from '../classes/HttpException';
import { Middleware } from '../middleware/common';
import { CustomValidators } from '../classes/CustomValidators';
import sequelize from 'sequelize';
import nodemailer from 'nodemailer';
import {body} from 'express-validator/check';

import {AppConfig} from '../utils/Config';
import {messages} from '../middleware/common';
import { Article } from '../models/article';
import { ArticleTranslation } from '../models/article_translation';



export class ArticleController {

    constructor() {}

    /**Gets all articles for all cathegories, admin or blog rights required */
    static getAll = async (req: Request, res: Response, next:NextFunction) => {
        try {
            let result = [];
            let articles = await Article.findAll({order: [sequelize.literal('id DESC')]});
            for (let article of articles) result.push(article.sanitize(res.locals.language,"full"));
            res.json(result);
        } catch(error) {
            next(error);
        }
    }

    /**Gets article by id with all translations. Admin or content required (if cathegory not blog) or admin or blog required (if cathegory blog) */
    static getContentByIdFull = async (req: Request, res: Response, next:NextFunction) => {
        try {
            let result = [];
            let article = await Article.findByPk(req.body.id);
            if (article)
                if (article.cathegory=="blog") {
                    next( new HttpException(400, "Content loading cannot ask for blog article", null))
                } else {
                    res.json(article);
                }
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static getContentByIdFullChecks() {
        return [
            body('id').exists().withMessage('exists').custom(CustomValidators.dBExists(Article,'id')),
            Middleware.validate()
        ]
    }

    /**Gets article by id with all translations. Admin or content required (if cathegory not blog) or admin or blog required (if cathegory blog) */
    static getBlogByIdFull = async (req: Request, res: Response, next:NextFunction) => {
        try {
            let result = [];
            let article = await Article.findByPk(req.body.id);
            if (article)
                if (article.cathegory!="blog") {
                    next( new HttpException(400, "Blog loading cannot ask for content article", null))
                } else {
                    res.json(article);
                }
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static getBlogByIdFullChecks() {
        return [
            body('id').exists().withMessage('exists').custom(CustomValidators.dBExists(Article,'id')),
            Middleware.validate()
        ]
    }


    /**Deletes article by id with all translations. Admin or content required (if cathegory not blog) or admin or blog required (if cathegory blog) */
    static deleteContent = async (req: Request, res: Response, next:NextFunction) => {
        try {
            let result = [];
            let article = await Article.findByPk(req.body.id);
            if (article)
                if (article.cathegory=="blog" || article.cathegory=="content") {
                    next( new HttpException(400, "Content Article deletion cannot ask for blog article", null))
                } else {
                    await article.destroy();
                    res.send({message: {show:true,text:messages.articleDelete}}); 
                }
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static deleteContentChecks() {
        return [
            body('id').exists().withMessage('exists').custom(CustomValidators.dBExists(Article,'id')),
            Middleware.validate()
        ]
    }

    /**Deletes article by id with all translations. Admin or content required (if cathegory not blog) or admin or blog required (if cathegory blog) */
    static deleteBlog = async (req: Request, res: Response, next:NextFunction) => {
        try {
            let result = [];
            let article = await Article.findByPk(req.body.id);
            if (article)
                if (article.cathegory!="blog") {
                    next( new HttpException(400, "Blog article deletion cannot ask for content article", null))
                } else {
                    await article.destroy();
                    res.send({message: {show:true,text:messages.articleDelete}}); 
                }
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static deleteBlogChecks() {
        return [
            body('id').exists().withMessage('exists').custom(CustomValidators.dBExists(Article,'id')),
            Middleware.validate()
        ]
    }

    /**Creates article content on the given cathegory. Admin or content required (if cathegory not blog) or admin or blog required (if cathegory blog) */
    static createContent = async (req: Request, res: Response, next:NextFunction) => {
        try {
            if (req.body.cathegory =="blog" || req.body.cathegory =="content") {
                next( new HttpException(400, "Content Article creation cannot ask for blog article", null))
            } else {
                let myArticle = await Article.create({
                    cathegory: req.body.cathegory
                });
                if (myArticle) {
                    for (let lang of Middleware.languagesSupported()) {
                        await ArticleTranslation.create({
                            'iso': lang,
                            'articleId': myArticle.id,
                            'title': messages.articleNewTitle,
                            'description': messages.articleNewDescription,
                            'content': messages.articleNewContent
                        });
                    } 
                }
                res.json(await Article.findByPk(myArticle.id));
            }
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static createContentChecks() {
        return [
            body('cathegory').exists().withMessage('exists').not().isEmpty(),
            body('cathegory').custom(CustomValidators.dBExists(Article,messages.cathegory)),
            Middleware.validate()
        ]
    }

    /**Creates article 'blog' on the given cathegory. Admin or content required (if cathegory not blog) or admin or blog required (if cathegory blog) */
    static createBlog = async (req: Request, res: Response, next:NextFunction) => {
        try {
            if (req.body.cathegory !="blog") {
                next( new HttpException(400, "Content Article creation cannot ask for blog article", null))
            } else {
                res.json(await Article.create());
            }
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static createBlogChecks() {
        return [
            body('cathegory').exists().withMessage('exists').custom(CustomValidators.dBExists(Article,'cathegory')),
            Middleware.validate()
        ]
    }





    


    /**Gets article by id with all translations. Admin or content required (if cathegory not blog) or admin or blog required (if cathegory blog) */
    static updateContent = async (req: Request, res: Response, next:NextFunction) => {
        try {
            console.log(req.body);
            let result = [];
            let article = await Article.findByPk(req.body.article.id);
            if (article)
                if (article.cathegory=="blog") {
                    next( new HttpException(400, "Content loading cannot ask for blog article", null))
                } else {
                    //TODO::Update here image if required
                    article.public = req.body.article.public;
                    article.cathegory = req.body.article.cathegory;
                    await article.save();
                    for (let translation of article.translations) {
                        let data : ArticleTranslation = req.body.article.translations.find( (obj:ArticleTranslation) => obj.iso ==  translation.iso);
                        if (data) {
                            if (data.content)
                                translation.content = data.content;
                            if (data.title)
                                translation.title = data.title;
                            if (data.description)
                                translation.description = data.description;                                                                
                            await translation.save();
                        }
                    }
                    res.json(await Article.findByPk(req.body.article.id));
                }
        } catch(error) {
            next(error);
        }
    }
    /**Parameter validation */
    static updateContentChecks() {
        return [
            body('article').exists().withMessage('exists'),
            body('article.id').exists().withMessage('exists').custom(CustomValidators.dBExists(Article,'id')),
            body('article.translations').exists().withMessage('exists'),
            //TODO: Add here all required checks !!!

            Middleware.validate()
        ]
    }











    static getByCathegory = async (req: Request, res: Response, next:NextFunction) => {
        try {
            let result = [];
            let articles = await Article.findAll({where: {cathegory: req.body.cathegory}});
            for (let article of articles) result.push(article.sanitize(res.locals.language, "summary"));
            res.json(result);
        } catch(error) {
            next(error);
        }
       
    }
    /**Parameter validation */
    static getByCathegoryChecks() {
        return [
            body('cathegory').exists().withMessage('exists').isLength({min:2}).withMessage("minlength"),
            Middleware.validate()
        ]
    }
}        