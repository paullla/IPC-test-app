import {
    $query,
    $update,
    Record,
    Opt,
    Vec,
    nat64,
    StableBTreeMap,
    Principal,
    match,
    Result,
    ic,
    int
} from 'azle';

import { v4 as uuidv4 } from 'uuid';

// Define BlogPost type
type BlogPost = Record<{
    id: string;
    title: string;
    content: string;
    author: string;
    createdAt: nat64;
    numberOfViews: int;
    commentIds: Vec<string>;
}>;

// Define CommentType type
type CommentType = Record<{
    id: string;
    authorName: string;
    content: string;
    createdAt: nat64;
    blogPostId: string;
}>;

// Define payload types
type BlogPostPayload = Record<{
    title: string;
    content: string;
    author: string;
}>;

type CommentPayload = Record<{
    authorName: string;
    content: string;
}>;

// Create storage for blog posts and comments
const blogPostStorage = new StableBTreeMap<string, BlogPost>(0, 44, 1024);
const commentStorage = new StableBTreeMap<string, CommentType>(1, 44, 1024);

// Query functions

// Retrieve all blog posts
$query
export function getBlogPosts(): Result<Vec<BlogPost>, string> {
    try {
        return Result.Ok(blogPostStorage.values());
    } catch (error) {
        return Result.Err<Vec<BlogPost>, string>('Failed while trying to get blog posts');
    }
};

// Retrieve a single blog post and increment view count
$query
export function getSingleBlogPost(id: string): Result<Opt<BlogPost>, string> {
    try {
        // Validate parameters
        if (!id) {
            return Result.Err<Opt<BlogPost>, string>('Invalid parameters for getting a single blog post');
        }

        const blogPostOpt = blogPostStorage.get(id);

        return match(blogPostOpt, {
            Some: (blogPost) => {
                // Increment the number of views when a blog post is viewed
                blogPost.numberOfViews += BigInt(1);
                blogPostStorage.insert(blogPost.id, blogPost);
                return Result.Ok<Opt<BlogPost>, string>(blogPostOpt);
            },
            None: () => Result.Err<Opt<BlogPost>, string>(`A blog post with id=${id} not found`),
        });
    } catch (error) {
        return Result.Err<Opt<BlogPost>, string>('Failed while trying to get a blog post');
    }
}

// Update functions

// Create a new blog post
$update
export function createBlogPost(payload: BlogPostPayload): Result<string, string> {
    try {
        // Validate payload properties
        if (!payload.title || !payload.content || !payload.author) {
            return Result.Err<string, string>('Invalid payload for creating a blog post');
        }

        const blogPost: BlogPost = {
            id: uuidv4(),
            createdAt: ic.time(),
            numberOfViews: BigInt(0),
            commentIds: [],
            title: payload.title,
            content: payload.content,
            author: payload.author
        };
        blogPostStorage.insert(blogPost.id, blogPost);

        return Result.Ok('Blog post created successfully');
    } catch (error) {
        return Result.Err<string, string>('Failed while trying to create a blog post');
    }
}

// Update an existing blog post
$update
export function updateBlogPost(payload: BlogPostPayload, blogPostID: string): Result<BlogPost, string> {
    // Validate parameters
    if (!blogPostID) {
        return Result.Err<BlogPost, string>('Invalid parameters for updating a blog post');
    }

    // Validate payload properties
    if (!payload.title || !payload.content || !payload.author) {
        return Result.Err<BlogPost, string>('Invalid payload for creating a blog post');
    }
    const blogPostOpt = blogPostStorage.get(blogPostID);

    return match(blogPostOpt, {
        Some: (blogPost) => {

            // Set each property individually instead of spreading the payload
            const updatedBlogPost: BlogPost = {
                ...blogPost,
                title: payload.title,
                content: payload.content,
                author: payload.author
            };

            blogPostStorage.insert(blogPost.id, updatedBlogPost);

            return Result.Ok<BlogPost, string>(updatedBlogPost);
        },
        None: () => Result.Err<BlogPost, string>(`A blog post with id=${blogPostID} not found`),
    });
}

// Delete functions

// Delete a blog post
$update
export function deleteBlogPost(id: string): Result<string, string> {
    // Validate parameters
    if (!id) {
        return Result.Err<string, string>('Invalid parameters for deleting a blog post');
    }

    const blogPostOpt = blogPostStorage.get(id);

    return match(blogPostOpt, {
        Some: () => {
            blogPostStorage.remove(id);
            return Result.Ok<string, string>('Blog post deleted successfully');
        },
        None: () => Result.Err<string, string>(`A blog post with id=${id} not found`),
    });
}

// Create a new comment for a blog post
$update
export function addComment(payload: CommentPayload, blogPostID: string): Result<string, string> {
    // Validate parameters
    if (!blogPostID) {
        return Result.Err<string, string>('Invalid parameters for adding a comment');
    }

    const blogPostOpt = blogPostStorage.get(blogPostID);

    return match(blogPostOpt, {
        Some: (blogPost) => {
            // Validate payload properties
            if (!payload.authorName || !payload.content) {
                return Result.Err<string, string>('Invalid payload for adding a comment');
            }

            // Set each property individually instead of spreading the payload
            const comment: CommentType = {
                id: uuidv4(),
                blogPostId: blogPost.id,
                createdAt: ic.time(),
                ...payload,
            };

            commentStorage.insert(comment.id, comment);
            blogPost.commentIds.push(comment.id);
            blogPostStorage.insert(blogPost.id, blogPost);

            return Result.Ok<string, string>('Comment created successfully');
        },
        None: () => Result.Err<string, string>(`A blog post with id=${blogPostID} not found`),
    });
}

// Query functions

// Retrieve comments for a blog post
$query
export function getCommentsByBlogPost(blogPostID: string): Result<Vec<CommentType>, string> {
    // Validate parameters
    if (!blogPostID) {
        return Result.Err<Vec<CommentType>, string>('Invalid parameters for getting comments');
    }

    const blogPostOpt = blogPostStorage.get(blogPostID);

    return match(blogPostOpt, {
        Some: (blogPost) => {
            const blogPostComments = commentStorage.values().filter(
                (comment: CommentType) => comment.blogPostId === blogPost.id
            );

            return Result.Ok<Vec<CommentType>, string>(blogPostComments);
        },
        None: () => Result.Err<Vec<CommentType>, string>(`A blog post with id=${blogPostID} not found`),
    });
}

// Retrieve most popular blog posts
$query
export function getMostPopularBlogPosts(numberOfBlogPosts: int): Result<Vec<BlogPost>, string> {
    try {
        const blogPosts = blogPostStorage.values();
        blogPosts.sort((a: BlogPost, b: BlogPost) => {
            const aPopularity = a.commentIds.length + Number(a.numberOfViews);
            const bPopularity = b.commentIds.length + Number(b.numberOfViews);

            return aPopularity - bPopularity;
        });

        return Result.Ok(blogPosts.slice(0, Number(numberOfBlogPosts)));
    } catch (error) {
        return Result.Err<Vec<BlogPost>, string>('Failed while trying to get most popular blog posts');
    }
}

// A workaround to make the uuid package work with Azle
globalThis.crypto = {
    // @ts-ignore
    getRandomValues: () => {
        let array = new Uint8Array(32);

        for (let i = 0; i < array.length; i++) {
            array[i] = Math.floor(Math.random() * 256);
        }

        return array;
    },
};
